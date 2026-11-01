import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

const MAX_BYTES = 1024 * 1024;

let file: string | null = null;

/** Starts writing `app.log` in `folder`; the previous megabyte is kept as `app.old.log`. */
export function initLog(folder: string): string {
  mkdirSync(folder, { recursive: true });
  file = join(folder, 'app.log');
  return file;
}

function write(level: 'info' | 'error', message: string): void {
  if (!file) return;
  try {
    const size = statSync(file, { throwIfNoEntry: false })?.size ?? 0;
    if (size > MAX_BYTES) renameSync(file, join(dirname(file), 'app.old.log'));
    appendFileSync(file, `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} ${message}\n`);
  } catch {
    // The log must never break recording.
  }
}

export function logInfo(message: string): void {
  write('info', message);
}

export function logError(message: string, error?: unknown): void {
  const detail = error instanceof Error ? (error.stack ?? error.message) : error === undefined ? '' : String(error);
  write('error', detail ? `${message}: ${detail}` : message);
}
