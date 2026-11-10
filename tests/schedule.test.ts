import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { fetchGroups, fetchSchedule, GroupNotFoundError, normalizeGroup, parseSchedule, ScheduleError, webinarUrl } from '../src/main/schedule/dmami';
import { buildLessons, moscowInstant, slotTime, weekday } from '../src/main/schedule/timetable';

const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));

describe('parseSchedule', () => {
  it('parses a weekly grid', () => {
    const parsed = parseSchedule(fixture('group-231-321.json'));
    expect(parsed.title).toBe('231-321');
    expect(parsed.evening).toBe(0);
    expect(parsed.dateFrom).toBe('2026-09-01');
    expect(parsed.entries.length).toBeGreaterThan(5);
    expect(parsed.entries.every((entry) => entry.weekday !== null && entry.date === null)).toBe(true);
  });

  it('keeps only MTS Link webinar links', () => {
    const parsed = parseSchedule(fixture('group-231-321.json'));
    const links = parsed.entries.map((entry) => entry.link).filter((link) => link !== null);
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) expect(new URL(link).hostname).toMatch(/mts-link\.ru$|webinar\.ru$/);
    const docs = parsed.entries.find((entry) => entry.subject === 'Проектная деятельность');
    expect(docs?.link).toBeNull();
    expect(docs?.rooms).toBe('🚀 ПД');
  });

  it('parses a grid keyed by dates', () => {
    const parsed = parseSchedule(fixture('group-253-011-dated.json'));
    expect(parsed.entries.every((entry) => entry.date !== null && entry.weekday === null)).toBe(true);
    const lessons = buildLessons(parsed);
    expect(lessons[0]?.date).toBe('2026-11-23');
    expect(lessons[0]?.startTime).toBe('14:30');
  });

  it('reports the site error message', () => {
    expect(() => parseSchedule({ status: 'error', message: 'Не нашлось расписание для группы' }))
      .toThrow(new ScheduleError('Не нашлось расписание для группы'));
    expect(() => parseSchedule('<html>')).toThrow(ScheduleError);
  });

  it('tells a missing group from a broken answer', () => {
    const caught = (value: unknown): unknown => {
      try {
        return parseSchedule(value);
      } catch (error) {
        return error;
      }
    };
    expect(caught({ status: 'error', message: 'Не нашлось расписание для группы' })).toBeInstanceOf(GroupNotFoundError);
    expect(caught({ status: 'ok' })).toBeInstanceOf(GroupNotFoundError);
    expect(caught('<html>Bad gateway</html>')).not.toBeInstanceOf(GroupNotFoundError);
    expect(caught({ grid: {} })).not.toBeInstanceOf(GroupNotFoundError);
  });

  it('decodes HTML entities in names and links', () => {
    const parsed = parseSchedule({
      status: 'ok',
      group: { title: 'X', dateFrom: '2026-09-01', dateTo: '2026-09-30', evening: 0 },
      grid: { 1: { 1: [{
        sbj: 'Основы &laquo;R&amp;D&raquo; &#8212; часть&nbsp;&#x49;&#73;', df: '2026-09-01', dt: '2026-09-30', teacher: 'О&#39;Нил <b>Ш.</b>',
        auditories: [{ title: '<a href="https://my.mts-link.ru/j/1/2?a=1&#38;b=2&#x26;c=3">Webinar</a>' }],
      }] } },
    });
    expect(parsed.entries[0]).toMatchObject({
      // Entities outside the short known list stay as they are rather than turn into something wrong.
      subject: 'Основы &laquo;R&D&raquo; — часть II',
      teacher: "О'Нил Ш.",
      link: 'https://my.mts-link.ru/j/1/2?a=1&b=2&c=3',
    });
  });

  it('skips malformed lessons instead of failing', () => {
    const parsed = parseSchedule({
      status: 'ok',
      group: { title: 'X', dateFrom: '2026-09-01', dateTo: '2026-09-30', evening: 0 },
      grid: { 1: { 1: [{ sbj: '' }, { sbj: 'Физика', df: '2026-09-01', dt: '2026-09-30', type: 'Лекция', auditories: [
        { title: '<a href="https://my.mts-link.ru/j/1/2?a=1&amp;b=2">📷 Webinar</a>' },
      ] }] } },
    });
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.entries[0]?.link).toBe('https://my.mts-link.ru/j/1/2?a=1&b=2');
  });
});

describe('buildLessons', () => {
  it('repeats weekday lessons weekly within both ranges', () => {
    const lessons = buildLessons({
      title: 'X', evening: 0, dateFrom: '2026-09-01', dateTo: '2026-09-30',
      entries: [{ weekday: 3, date: null, slot: 2, from: '2026-09-07', to: '2026-12-31', subject: 'Физика', type: 'Лекция', teacher: '', rooms: '', link: null }],
    });
    expect(lessons.map((lesson) => lesson.date)).toEqual(['2026-09-09', '2026-09-16', '2026-09-23', '2026-09-30']);
    expect(lessons[0]?.startsAt).toBe(Date.parse('2026-09-09T07:40:00Z'));
    expect(new Set(lessons.map((lesson) => lesson.id)).size).toBe(4);
  });

  it('keeps the recordable copy of a lesson listed twice', () => {
    const entry = { weekday: null, date: '2026-09-09', slot: 2, from: '2026-09-09', to: '2026-09-09', subject: 'Физика', type: 'Лекция', teacher: '', rooms: '' };
    const link = 'https://my.mts-link.ru/j/1/2';
    const other = 'https://my.mts-link.ru/j/3/4';
    const build = (...links: (string | null)[]): (string | null)[] => buildLessons({
      title: 'X', evening: 0, dateFrom: '2026-09-01', dateTo: '2026-09-30', entries: links.map((value) => ({ ...entry, link: value })),
    }).map((lesson) => lesson.link);
    expect(build(null, link)).toEqual([link]);
    expect(build(link, null)).toEqual([link]);
    expect(build(link, other)).toEqual([link]);
  });

  it('uses evening grids', () => {
    expect(slotTime(0, 6)).toEqual(['17:50', '19:20']);
    expect(slotTime(1, 7)).toEqual(['19:50', '21:10']);
    expect(slotTime(2, 6)).toEqual(['18:30', '20:00']);
    expect(slotTime(0, 8)).toBeNull();
  });

  it('builds real lessons in Moscow time', () => {
    const lessons = buildLessons(parseSchedule(fixture('group-231-321.json')));
    expect(lessons.length).toBeGreaterThan(20);
    for (const lesson of lessons) {
      expect(lesson.endsAt - lesson.startsAt).toBeGreaterThanOrEqual(80 * 60_000);
      expect(weekday(lesson.date)).toBeLessThanOrEqual(7);
    }
    expect(moscowInstant('2026-11-02', '09:00')).toBe(Date.parse('2026-11-02T06:00:00Z'));
  });
});

describe('helpers', () => {
  it('normalises group input', () => {
    expect(normalizeGroup(' 231 321 ')).toBe('231-321');
    expect(normalizeGroup('дпо–цм2')).toBe('ДПО-ЦМ2');
    expect(normalizeGroup('231 – 321')).toBe('231-321');
    expect(normalizeGroup('231--321')).toBe('231-321');
  });

  it('rejects non-webinar links', () => {
    expect(webinarUrl('http://my.mts-link.ru/j/1/2')).toBeNull();
    expect(webinarUrl('https://evil.example/j/1')).toBeNull();
    expect(webinarUrl('javascript:alert(1)')).toBeNull();
  });
});

describe.runIf(process.env.LIVE_TESTS)('rasp.dmami.ru (live)', () => {
  it('lists groups and loads a schedule', async () => {
    const groups = await fetchGroups();
    expect(groups.length).toBeGreaterThan(100);
    const parsed = await fetchSchedule('231-321');
    expect(parsed.title).toBe('231-321');
  }, 60_000);
});
