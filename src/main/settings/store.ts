import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
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
}).partial().strict();

export function defaultFolder(documents: string): string {
  return join(documents, 'MosPolytech Records');
}

/** JSON settings file; unreadable or invalid fields fall back to defaults. */
export class SettingsStore {
  private value: Settings;
  private readonly listeners = new Set<(settings: Settings) => void>();

  constructor(private readonly file: string, private readonly fallbackFolder: string) {
    let raw: unknown = {};
    try {
      raw = JSON.parse(readFileSync(file, 'utf8')) as unknown;
    } catch {
      // First run or a damaged file: start from defaults.
    }
    this.value = this.normalize(settingsSchema.parse(typeof raw === 'object' && raw !== null ? raw : {}));
  }

  get(): Settings {
    return structuredClone(this.value);
  }

  /** Validates untrusted input (it comes from the renderer) before saving. */
  update(patch: unknown): Settings {
    const parsed = patchSchema.parse(patch);
    this.value = this.normalize({ ...this.value, ...parsed });
    mkdirSync(dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp`;
    writeFileSync(temp, JSON.stringify(this.value, null, 2));
    renameSync(temp, this.file);
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
