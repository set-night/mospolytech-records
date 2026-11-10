import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GroupNotFoundError, parseSchedule, ScheduleError, type ParsedSchedule } from '../src/main/schedule/dmami';
import { ScheduleService } from '../src/main/schedule/service';

const fixture = (name: string): ParsedSchedule =>
  parseSchedule(JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')));
const SITE: Record<string, ParsedSchedule> = {
  '231-321': fixture('group-231-321.json'),
  '253-011': fixture('group-253-011-dated.json'),
};

/** The site without the network: real answers for two groups, "not found" for the rest. */
async function site(group: string): Promise<ParsedSchedule> {
  const found = SITE[group];
  if (!found) throw new GroupNotFoundError('Не нашлось расписание для группы');
  return found;
}

const cacheFile = (): string => join(mkdtempSync(join(tmpdir(), 'mpr-schedule-')), 'cache', 'schedule.json');

describe('ScheduleService', () => {
  it('loads the timetable, caches it and survives the site being down', async () => {
    const file = cacheFile();
    const online = new ScheduleService(file, () => '231-321', site);
    expect(online.state()).toEqual({ schedule: null, loading: false, error: null });
    const states: boolean[] = [];
    online.onChange((state) => states.push(state.loading));
    const loaded = await online.refresh();
    online.stop();
    expect(loaded.schedule?.lessons.length).toBeGreaterThan(20);
    expect(loaded).toMatchObject({ loading: false, error: null });
    expect(states).toEqual([true, false]);

    const offline = new ScheduleService(file, () => '231-321', async () => { throw new ScheduleError('Нет связи с rasp.dmami.ru'); });
    expect(offline.state().schedule).toEqual(loaded.schedule);
    const failed = await offline.refresh();
    offline.stop();
    expect(failed.error).toBe('Нет связи с rasp.dmami.ru');
    expect(failed.schedule).toEqual(loaded.schedule);
  });

  it('ignores a cache it cannot trust', () => {
    const file = join(mkdtempSync(join(tmpdir(), 'mpr-schedule-')), 'schedule.json');
    writeFileSync(file, JSON.stringify({ group: '231-321', title: '231-321', fetchedAt: 1, lessons: [{ id: 'a', startsAt: 'soon' }] }));
    expect(new ScheduleService(file, () => '231-321', site).state().schedule).toBeNull();
    writeFileSync(file, '{"group": "231-3');
    expect(new ScheduleService(file, () => '231-321', site).state().schedule).toBeNull();
  });

  it('shares one request between concurrent refreshes', async () => {
    let calls = 0;
    const service = new ScheduleService(cacheFile(), () => '231-321', (group) => {
      calls += 1;
      return site(group);
    });
    const [first, second] = await Promise.all([service.refresh(), service.refresh()]);
    service.stop();
    expect(calls).toBe(1);
    expect(first).toBe(second);
  });

  it('goes again when the group changes while a request is in flight', async () => {
    let group = '231-321';
    const asked: string[] = [];
    const service = new ScheduleService(cacheFile(), () => group, async (requested) => {
      asked.push(requested);
      const answer = await site(requested);
      // The user saves another group before the first answer arrives.
      group = '253-011';
      return answer;
    });
    const state = await service.refresh();
    service.stop();
    expect(asked).toEqual(['231-321', '253-011']);
    expect(state.schedule).toMatchObject({ group: '253-011', title: SITE['253-011']!.title });
  });

  it('shows an error only for the group it is about', async () => {
    let group = '000-000';
    const service = new ScheduleService(cacheFile(), () => group, site);
    expect((await service.refresh()).error).toBe('Не нашлось расписание для группы');
    group = '231-321';
    expect(service.state()).toEqual({ schedule: null, loading: false, error: null });
    expect((await service.refresh()).schedule?.group).toBe('231-321');
    group = '';
    expect(await service.refresh()).toEqual({ schedule: null, loading: false, error: null });
    service.stop();
  });

  it('does not leak unexpected errors to the UI', async () => {
    const service = new ScheduleService(cacheFile(), () => '231-321', async () => { throw new TypeError('x is not a function'); });
    expect((await service.refresh()).error).toBe('Не удалось загрузить расписание');
    service.stop();
  });
});
