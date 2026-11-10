import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
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
  // Cut first: Windows rejects names ending in a dot or a space, and the cut may leave one.
  return value.replace(/[<>:"/\\|?*\p{Cc}]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 120).replace(/[. ]+$/, '');
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
  const stem = ext ? name.slice(0, -ext.length) : name;
  for (let index = 1; ; index += 1) {
    const candidate = join(folder, index === 1 ? name : `${stem} (${index})${ext}`);
    if (!existsSync(candidate)) return candidate;
  }
}

function metaPath(folder: string, file: string): string {
  return join(folder, META_DIR, `${basename(file)}.json`);
}

/** Synchronous on purpose: the recorder writes it at the exact moment a part starts or ends. */
export function writeMeta(folder: string, file: string, meta: RecordingMeta): void {
  const path = metaPath(folder, file);
  mkdirSync(join(folder, META_DIR), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(meta, null, 2));
  renameSync(`${path}.tmp`, path);
}

async function readMeta(folder: string, file: string): Promise<RecordingMeta | null> {
  try {
    return metaSchema.parse(JSON.parse(await readFile(metaPath(folder, file), 'utf8')));
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

interface Scanned {
  recording: Recording;
  /** Made by this app: it has metadata next to it. */
  own: boolean;
}

async function scan(folder: string, recordingFile: string | null): Promise<Scanned[]> {
  let names: string[];
  try {
    names = await readdir(folder);
  } catch {
    return [];
  }
  const videos = names.filter((name) => VIDEO.has(extname(name).toLowerCase()));
  const scanned = await Promise.all(videos.map(async (name): Promise<Scanned | null> => {
    const file = join(folder, name);
    const [info, stored] = await Promise.all([stat(file).catch(() => null), readMeta(folder, file)]);
    if (!info?.isFile()) return null;
    const meta = stored ?? fallbackMeta(name, info.mtimeMs);
    // A crash leaves `recording` behind; only the live session may claim it.
    const status = meta.status === 'recording' && file !== recordingFile ? 'partial' : meta.status;
    return { recording: { ...meta, status, file, name, size: info.size }, own: stored !== null };
  }));
  return scanned.filter((item) => item !== null).sort((a, b) => b.recording.startedAt - a.recording.startedAt);
}

/** Videos in the folder, newest first; files dropped in by hand are listed too. */
export async function listRecordings(folder: string, recordingFile: string | null): Promise<Recording[]> {
  return (await scan(folder, recordingFile)).map((item) => item.recording);
}

function fallbackMeta(name: string, mtime: number): RecordingMeta {
  const match = /^(\d{4}-\d{2}-\d{2}) (\d{2})-(\d{2}) (.+?)(?: \(([^)]+)\))?(?: — часть \d+)?(?: \(\d+\))?\.\w+$/.exec(name);
  // The name keeps the lesson start in Moscow time; mtime changes when a file is copied or moved.
  const named = match ? Date.parse(`${match[1]}T${match[2]}:${match[3]}:00+03:00`) : NaN;
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
  await rm(metaPath(folder, path), { force: true });
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
  for (const { recording, own } of await scan(folder, recordingFile)) {
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
