import { copyFileSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join } from 'node:path';
import { z } from 'zod';
import type { Settings } from '@shared/types';

const settingsSchema = z.object({
  group: z.string().trim().max(40).catch(''),
  folder: z.string().catch(''),
  nickname: z.string().trim().min(1).max(60).catch('Слушатель'),
  autoStart: z.boolean().catch(true),
  quality: z.enum(['low', 'medium', 'high']).catch('medium'),
  disabledSubjects: z.array(z.string().max(300)).max(500).catch([]),
  onboarded: z.boolean().catch(false),
  notifications: z.boolean().catch(true),
  keepDays: z.number().int().min(0).max(3650).catch(0),
  updates: z.enum(['auto', 'ask', 'notify']).catch('auto'),
  seenVersion: z.string().max(40).catch(''),
  announcedVersion: z.string().max(40).catch(''),
});

/** Strict: a bad value from the UI is an error, not a silent default. */
export const patchSchema = z.object({
  group: z.string().trim().max(40),
  folder: z.string().min(1).max(1000),
  nickname: z.string().trim().min(1).max(60),
  autoStart: z.boolean(),
  quality: z.enum(['low', 'medium', 'high']),
  disabledSubjects: z.array(z.string().max(300)).max(500),
  onboarded: z.boolean(),
  notifications: z.boolean(),
  keepDays: z.number().int().min(0).max(3650),
  updates: z.enum(['auto', 'ask', 'notify']),
  seenVersion: z.string().max(40),
  announcedVersion: z.string().max(40),
}).partial().strict();

export function defaultFolder(documents: string): string {
  return join(documents, 'MosPolytech Records');
}

/** What is in the file, or `null` when there is no file yet. Throws when the file is not a JSON object. */
function read(file: string): Record<string, unknown> | null {
  let text: string;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return null;
  }
  const raw = JSON.parse(text) as unknown;
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('Not an object');
  return raw as Record<string, unknown>;
}

/** JSON settings file; unreadable or invalid fields fall back to defaults. */
export class SettingsStore {
  /**
   * Set when the file could not be read and the app started from defaults: where its copy is,
   * so that the group and the folder can be recovered by hand. The next save overwrites the file.
   */
  readonly damaged: string | null = null;
  private value: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(private readonly file: string, private readonly fallbackFolder: string) {
    let raw: Record<string, unknown> | null = null;
    try {
      raw = read(file);
    } catch {
      const copy = `${file}.bad`;
      try {
        copyFileSync(file, copy);
        this.damaged = copy;
      } catch {
        // No copy then; the defaults below still let the app start.
      }
    }
    this.value = this.normalize(settingsSchema.parse(raw ?? {}));
  }

  get(): Settings {
    return structuredClone(this.value);
  }

  /** Validates untrusted input (it comes from the renderer) before saving. */
  update(patch: unknown): Settings {
    const parsed = patchSchema.parse(patch);
    const next = this.normalize({ ...this.value, ...parsed });
    // Disk first: if the write fails, the app must not run on settings that are gone after a restart.
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(next, null, 2));
    renameSync(temp, this.file);
    this.value = next;
    for (const listener of this.listeners) listener(this.get());
    return this.get();
  }

  onChange(listener: (settings: Settings) => void): void {
    this.listeners.add(listener);
  }

  private normalize(settings: Settings): Settings {
    return {
      ...settings,
      folder: settings.folder && isAbsolute(settings.folder) ? settings.folder : this.fallbackFolder,
      disabledSubjects: [...new Set(settings.disabledSubjects)],
    };
  }
}
