import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Lesson } from '@shared/types';
import { awaitingLink, lessonToRecord, nextToRecord, stopAt, LEAD, GRACE } from '../src/main/recorder/plan';
import { webinarRoom } from '../src/main/recorder/probe';
import { freePath, insideFolder, listRecordings, recordingName, trashRecording, writeMeta, META_DIR } from '../src/main/recordings/library';

const MIN = 60_000;
const base = Date.parse('2026-11-02T06:00:00Z');

function lesson(id: string, startMin: number, patch: Partial<Lesson> = {}): Lesson {
  return {
    id, date: '2026-11-02', slot: 1, startTime: '09:00', endTime: '10:30',
    startsAt: base + startMin * MIN, endsAt: base + (startMin + 90) * MIN,
    subject: 'Физика', subjectKey: 'физика', type: 'Лекция', teacher: '', rooms: '',
    link: 'https://my.mts-link.ru/j/1/2', ...patch,
  };
}

describe('plan', () => {
  const lessons = [lesson('a', 0), lesson('b', 100, { subject: 'Химия', subjectKey: 'химия' }), lesson('c', 200, { link: null })];
  const input = (now: number, extra: { disabled?: string[]; skip?: string[] } = {}) => ({
    lessons, now, disabled: new Set(extra.disabled), skip: new Set(extra.skip),
  });

  it('joins a few minutes early and stops at the bell', () => {
    expect(lessonToRecord(input(base - LEAD - MIN))).toBeNull();
    expect(lessonToRecord(input(base - LEAD + MIN))?.id).toBe('a');
    expect(lessonToRecord(input(base + 89 * MIN))?.id).toBe('a');
    expect(lessonToRecord(input(base + 91 * MIN))).toBeNull();
  });

  it('respects switched off subjects and skipped lessons', () => {
    expect(lessonToRecord(input(base, { disabled: ['физика'] }))).toBeNull();
    expect(lessonToRecord(input(base, { skip: ['a'] }))).toBeNull();
    expect(nextToRecord(input(base, { disabled: ['химия'] }))?.id).toBe('c');
  });

  it('asks for a fresh schedule when a lesson has no link yet', () => {
    expect(awaitingLink(input(base + 200 * MIN))).toBe(true);
    expect(awaitingLink(input(base))).toBe(false);
  });

  it('gives way to the next lesson', () => {
    expect(stopAt(lessons[0]!, input(base))).toBe(lessons[1]!.startsAt - LEAD);
    expect(stopAt(lessons[1]!, input(base))).toBe(lessons[1]!.endsAt + GRACE);
  });

  it('keeps recording to the end when the next lesson will not be recorded', () => {
    const whole = lessons[0]!.endsAt + GRACE;
    expect(stopAt(lessons[0]!, input(base, { disabled: ['химия'] }))).toBe(whole);
    expect(stopAt(lessons[0]!, input(base, { skip: ['b'] }))).toBe(whole);
  });

  it('strips per-user parameters from the room link', () => {
    expect(webinarRoom('https://my.mts-link.ru/j/123/456?utm=1#x')).toBe('https://my.mts-link.ru/j/123/456');
    expect(webinarRoom('https://events.webinar.ru/event/42/')).toBe('https://events.webinar.ru/event/42/');
  });
});

describe('library', () => {
  it('names files safely for every OS', () => {
    const name = recordingName(lesson('a', 0, { subject: 'Ин. яз: "Deutsch"/2?', type: 'Практика' }), 2, 'mp4');
    expect(name).toBe('2026-11-02 09-00 Ин. яз Deutsch 2 (Практика) — часть 2.mp4');
  });

  it('never ends a name with a dot or a space, even after cutting a long subject', () => {
    const subject = `${'я'.repeat(118)}. . хвост`;
    const name = recordingName(lesson('a', 0, { subject, type: '' }), 1, 'mp4');
    expect(name).toBe(`2026-11-02 09-00 ${'я'.repeat(118)}.mp4`);
  });

  it('reads the lesson from the name of a file without metadata', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'mpr-names-'));
    writeFileSync(join(folder, '2026-10-01 12-20 Химия (Семинар) — часть 2 (2).webm'), '');
    writeFileSync(join(folder, 'Лекция с телефона.mkv'), '');
    // Newest first: a file without a date in its name counts from its modification time.
    const [other, named] = await listRecordings(folder, null);
    expect(named).toMatchObject({ subject: 'Химия', type: 'Семинар', date: '2026-10-01', startTime: '12:20', status: 'done' });
    expect(other).toMatchObject({ subject: 'Лекция с телефона', type: '', startTime: '' });
  });

  it('numbers a taken name that has no extension', () => {
    const folder = mkdtempSync(join(tmpdir(), 'mpr-free-'));
    writeFileSync(join(folder, 'запись'), '');
    expect(freePath(folder, 'запись')).toBe(join(folder, 'запись (2)'));
  });

  it('lists recordings with metadata, recovers stale states and trashes', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'mpr-lib-'));
    const first = freePath(folder, recordingName(lesson('a', 0), 1, 'mp4'));
    writeFileSync(first, 'video');
    expect(freePath(folder, recordingName(lesson('a', 0), 1, 'mp4'))).toMatch(/\(Лекция\) \(2\)\.mp4$/);
    writeMeta(folder, first, {
      lessonId: 'a', subject: 'Физика', type: 'Лекция', teacher: 'Иванов', date: '2026-11-02', startTime: '09:00',
      endTime: '10:30', link: 'x', startedAt: base, finishedAt: null, status: 'recording', note: null,
    });
    writeFileSync(join(folder, '2026-10-01 12-20 Химия (Семинар).webm'), 'old');
    writeFileSync(join(folder, 'notes.txt'), 'skip');
    mkdirSync(join(folder, 'sub.mp4'));

    const list = await listRecordings(folder, null);
    expect(list.map((item) => item.subject)).toEqual(['Физика', 'Химия']);
    expect(list[0]).toMatchObject({ teacher: 'Иванов', status: 'partial', size: 5 });
    expect((await listRecordings(folder, first))[0]?.status).toBe('recording');
    expect(list[1]).toMatchObject({ type: 'Семинар', date: '2026-10-01', startTime: '12:20' });
    // The time in a file name is Moscow time, whatever the computer's time zone is.
    expect(list[1]?.startedAt).toBe(Date.parse('2026-10-01T09:20:00Z'));
    expect(await listRecordings(join(folder, 'missing'), null)).toEqual([]);

    expect(insideFolder(folder, join(folder, '..', 'x.mp4'))).toBeNull();
    expect(insideFolder(folder, join(folder, 'notes.txt'))).toBeNull();
    const trashed: string[] = [];
    await trashRecording(folder, first, async (path) => { trashed.push(path); });
    expect(trashed).toEqual([first]);
    expect(existsSync(join(folder, META_DIR, `${basename(first)}.json`))).toBe(false);
    await expect(trashRecording(folder, join(folder, META_DIR, 'x.mp4'), async () => {})).rejects.toThrow();
  });
});
