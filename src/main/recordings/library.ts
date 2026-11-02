import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, extname, join, relative, resolve, sep } from 'node:path';
import { z } from 'zod';
import type { Lesson, Recording, RecordingMeta } from '@shared/types';

/** Metadata lives in a sidecar folder so the recordings folder holds only videos. */
export const META_DIR = '.mospolytech-records';
const VIDEO = new Set(['.mp4', '.webm', '.mkv']);

const metaSchema = z.object({
  lessonId: z.string(),
  subject: z.string(),
  type: z.string(),
  teacher: z.string(),
  date: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  link: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  status: z.enum(['recording', 'done', 'partial']),
  note: z.string().nullable(),
});

/** Characters Windows, macOS and Linux all accept in a file name. */
function safeName(value: string): string {
  return value.replace(/[<>:"/\\|?*\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').replace(/[. ]+$/, '').trim().slice(0, 120);
}

/** `2026-11-02 09-00 Физика (Лекция).mp4`, with a part number for reconnects. */
export function recordingName(lesson: Lesson, part: number, ext: string): string {
  const type = lesson.type ? ` (${safeName(lesson.type)})` : '';
  const suffix = part > 1 ? ` — часть ${part}` : '';
  return `${lesson.date} ${lesson.startTime.replace(':', '-')} ${safeName(lesson.subject) || 'Пара'}${type}${suffix}.${ext}`;
}

/** A file name that does not exist yet in `folder`. */
export function freePath(folder: string, name: string): string {
  const ext = extname(name);
  const stem = name.slice(0, -ext.length);
  for (let index = 1; ; index += 1) {
    const candidate = join(folder, index === 1 ? name : `${stem} (${index})${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
}

function metaPath(file: string, folder: string): string {
  return join(folder, META_DIR, `${basename(file)}.json`);
}

export function writeMeta(folder: string, file: string, meta: RecordingMeta): void {
  const path = metaPath(file, folder);
  mkdirSync(join(folder, META_DIR), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(meta, null, 2));
  renameSync(`${path}.tmp`, path);
}

function readMeta(folder: string, file: string): RecordingMeta | null {
  try {
    return metaSchema.parse(JSON.parse(readFileSync(metaPath(file, folder), 'utf8')));
  } catch {
    return null;
  }
}

/** Guards IPC input: only files directly inside the recordings folder. */
export function insideFolder(folder: string, file: string): string | null {
  const path = resolve(file);
  const rel = relative(resolve(folder), path);
  return rel && !rel.startsWith('..') && !rel.includes(sep) && VIDEO.has(extname(path).toLowerCase()) ? path : null;
}

/** Videos in the folder, newest first; files dropped in by hand are listed too. */
export function listRecordings(folder: string, recordingFile: string | null): Recording[] {
  let names: string[];
  try {
    names = readdirSync(folder);
  } catch {
    return [];
  }
  const recordings: Recording[] = [];
  for (const name of names) {
    if (!VIDEO.has(extname(name).toLowerCase())) continue;
    const file = join(folder, name);
    let stat;
    try {
      stat = statSync(file);
    } catch {
      continue;
    }
    if (!stat.isFile()) continue;
    const meta = readMeta(folder, file) ?? fallbackMeta(name, stat.mtimeMs);
    // A crash leaves `recording` behind; only the live session may claim it.
    const status = meta.status === 'recording' && file !== recordingFile ? 'partial' : meta.status;
    recordings.push({ ...meta, status, file, name, size: stat.size });
  }
  return recordings.sort((a, b) => b.startedAt - a.startedAt);
}

function fallbackMeta(name: string, mtime: number): RecordingMeta {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2}) (.+?)(?: \(([^)]+)\))?(?: — часть \d+)?\.\w+$/.exec(name);
  // The name keeps the lesson start; mtime changes when a file is copied or moved.
  const named = match ? new Date(`${match[1]}T${match[2]}:${match[3]}:00`).getTime() : NaN;
  return {
    lessonId: '',
    subject: match?.[4] ?? name.replace(/\.\w+$/, ''),
    type: match?.[5] ?? '',
    teacher: '',
    date: match?.[1] ?? new Date(mtime).toISOString().slice(0, 10),
    startTime: match ? `${match[2]}:${match[3]}` : '',
    endTime: '',
    link: '',
    startedAt: Number.isNaN(named) ? mtime : named,
    finishedAt: mtime,
    status: 'done',
    note: null,
  };
}

/** Moves a recording to the system trash (`trash` is `shell.trashItem`) and drops its metadata. */
export async function trashRecording(folder: string, file: string, trash: (path: string) => Promise<void>): Promise<void> {
  const path = insideFolder(folder, file);
  if (!path) throw new Error('Файл не из папки с записями');
  await trash(path);
  rmSync(metaPath(path, folder), { force: true });
}

const DAY = 24 * 60 * 60_000;

/**
 * Trashes recordings this app made more than `keepDays` ago. Videos dropped into the
 * folder by hand and the one being written now are never touched. Returns how many went.
 */
export async function cleanupRecordings(
  folder: string,
  keepDays: number,
  now: number,
  recordingFile: string | null,
  trash: (path: string) => Promise<void>,
): Promise<number> {
  if (keepDays <= 0) return 0;
  let removed = 0;
  for (const recording of listRecordings(folder, recordingFile)) {
    const own = readMeta(folder, recording.file) !== null;
    if (!own || recording.file === recordingFile || now - recording.startedAt < keepDays * DAY) continue;
    try {
      await trashRecording(folder, recording.file, trash);
      removed += 1;
    } catch {
      // Locked by a player or already gone: try again next time.
    }
  }
  return removed;
}
