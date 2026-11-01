import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { RecordingMeta } from '../src/shared/types';
import { cleanupRecordings, writeMeta } from '../src/main/recordings/library';

const DAY = 24 * 60 * 60_000;
const NOW = Date.UTC(2026, 10, 2, 12);

function own(folder: string, name: string, startedAt: number): string {
  const file = join(folder, name);
  writeFileSync(file, 'video');
  const meta: RecordingMeta = {
    lessonId: name, subject: 'Физика', type: 'Лекция', teacher: '', date: '2026-09-01', startTime: '09:00', endTime: '10:30',
    link: '', startedAt, finishedAt: startedAt + DAY / 16, status: 'done', note: null,
  };
  writeMeta(folder, file, meta);
  return file;
}

const trash = async (path: string): Promise<void> => rmSync(path);

describe('cleanupRecordings', () => {
  it('trashes only old recordings the app made', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'mpr-cleanup-'));
    const old = own(folder, 'old.mp4', NOW - 40 * DAY);
    const fresh = own(folder, 'fresh.mp4', NOW - 5 * DAY);
    const live = own(folder, 'live.mp4', NOW - 40 * DAY);
    const manual = join(folder, 'manual.mp4');
    writeFileSync(manual, 'video');

    expect(await cleanupRecordings(folder, 30, NOW, live, trash)).toBe(1);
    expect(existsSync(old)).toBe(false);
    expect(existsSync(join(folder, '.mospolytech-records', 'old.mp4.json'))).toBe(false);
    expect([fresh, live, manual].every((file) => existsSync(file))).toBe(true);
  });

  it('keeps everything when keepDays is 0', async () => {
    const folder = mkdtempSync(join(tmpdir(), 'mpr-cleanup-'));
    const old = own(folder, 'old.mp4', NOW - 400 * DAY);
    expect(await cleanupRecordings(folder, 0, NOW, null, trash)).toBe(0);
    expect(existsSync(old)).toBe(true);
  });
});
