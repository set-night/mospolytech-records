import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SettingsStore } from '../src/main/settings/store';

const temp = (): string => mkdtempSync(join(tmpdir(), 'mpr-settings-'));

describe('SettingsStore', () => {
  it('starts from defaults and persists updates', () => {
    const dir = temp();
    const file = join(dir, 'settings.json');
    const store = new SettingsStore(file, '/docs/MosPolytech Records');
    expect(store.get()).toMatchObject({ group: '', nickname: 'Слушатель', folder: '/docs/MosPolytech Records', onboarded: false });
    store.update({ group: '231-321', disabledSubjects: ['физика', 'физика'] });
    const reread = new SettingsStore(file, '/other');
    expect(reread.get().group).toBe('231-321');
    expect(reread.get().disabledSubjects).toEqual(['физика']);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toMatchObject({ group: '231-321' });
  });

  it('recovers from a damaged file and bad fields', () => {
    const dir = temp();
    const file = join(dir, 'settings.json');
    writeFileSync(file, '{"nickname": "", "quality": "ultra", "folder": "relative/path"');
    expect(new SettingsStore(file, '/docs/R').get()).toMatchObject({ nickname: 'Слушатель', quality: 'medium', folder: '/docs/R' });
    writeFileSync(file, JSON.stringify({ nickname: '', quality: 'ultra', folder: 'relative' }));
    expect(new SettingsStore(file, '/docs/R').get()).toMatchObject({ nickname: 'Слушатель', quality: 'medium', folder: '/docs/R' });
  });

  it('rejects unknown keys from the renderer', () => {
    const store = new SettingsStore(join(temp(), 's.json'), '/docs/R');
    expect(() => store.update({ evil: true })).toThrow();
    expect(() => store.update({ autoStart: 'yes' })).toThrow();
  });
});
