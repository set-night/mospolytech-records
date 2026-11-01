import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
    expect(stopAt(lessons[0]!, lessons)).toBe(lessons[1]!.startsAt - LEAD);
    expect(stopAt(lessons[1]!, lessons)).toBe(lessons[1]!.endsAt + GRACE);
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

    const list = listRecordings(folder, null);
    expect(list.map((item) => item.subject)).toEqual(['Физика', 'Химия']);
    expect(list[0]).toMatchObject({ teacher: 'Иванов', status: 'partial', size: 5 });
    expect(listRecordings(folder, first)[0]?.status).toBe('recording');
    expect(list[1]).toMatchObject({ type: 'Семинар', date: '2026-10-01', startTime: '12:20' });

    expect(insideFolder(folder, join(folder, '..', 'x.mp4'))).toBeNull();
    expect(insideFolder(folder, join(folder, 'notes.txt'))).toBeNull();
    const trashed: string[] = [];
    await trashRecording(folder, first, async (path) => { trashed.push(path); });
    expect(trashed).toEqual([first]);
    await expect(trashRecording(folder, join(folder, META_DIR, 'x.mp4'), async () => {})).rejects.toThrow();
  });
});
