import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { REPO_URL } from '../src/shared/types';
import { NetError } from '../src/main/net';
import { canInstallNow, installKind, QUIET_BEFORE_LESSON, selfUpdating, shouldShowWhatsNew, type Moment } from '../src/main/updates/policy';
import { fetchRelease, installerFor, isNewer, parseNotes, type ReleaseAsset } from '../src/main/updates/release';
import { json, serve } from './http';

const body = readFileSync(join(__dirname, 'fixtures', 'release-v0.3.1.md'), 'utf8');
const download = (name: string): ReleaseAsset => ({ name, url: `${REPO_URL}/releases/download/v0.4.0/${name}` });

describe('isNewer', () => {
  it('compares versions as numbers, with or without v', () => {
    expect(isNewer('0.10.0', '0.9.9')).toBe(true);
    expect(isNewer('v0.4.0', '0.3.1')).toBe(true);
    expect(isNewer('0.3.1', '0.3.1')).toBe(false);
    expect(isNewer('0.3.0', '0.3.1')).toBe(false);
    expect(isNewer('1.0.0', '0.99.99')).toBe(true);
  });
});

describe('parseNotes', () => {
  it('takes the changes of a real release and leaves the download table out', () => {
    expect(parseNotes(body)).toEqual([
      { title: 'Исправления', items: ['Harden recorder, schedule and recordings library after a full code review'] },
    ]);
  });

  it('keeps several sections, strips links and markup', () => {
    const notes = parseNotes([
      '## Что нового',
      '### Новое',
      '* **updates:** обновления ставятся сами ([#12](https://x/12)) ([abc1234](https://x/c))',
      '* кнопка [«Проверить»](https://x) на странице `О программе`',
      '### Быстрее',
      '- запись стартует раньше',
      '## Скачать',
      '* [Установщик](https://x/setup.exe)',
    ].join('\n'));
    expect(notes).toEqual([
      { title: 'Новое', items: ['Обновления ставятся сами', 'Кнопка «Проверить» на странице О программе'] },
      { title: 'Быстрее', items: ['Запись стартует раньше'] },
    ]);
  });

  it('gives nothing for an empty or unrelated body', () => {
    expect(parseNotes('')).toEqual([]);
    expect(parseNotes('## Скачать\n* файл')).toEqual([]);
  });
});

describe('installerFor', () => {
  const assets = [
    'MosPolytech-Records-Setup-x64.exe',
    'MosPolytech-Records-x64.msi',
    'MosPolytech-Records-x86_64.AppImage',
    'MosPolytech-Records-amd64.deb',
    'MosPolytech-Records-arm64.dmg',
    'MosPolytech-Records-x64.dmg',
    'latest.yml',
  ].map(download);

  it('picks the file of the same kind of build', () => {
    expect(installerFor('nsis', 'x64', assets)).toMatch(/Setup-x64\.exe$/);
    expect(installerFor('msi', 'x64', assets)).toMatch(/x64\.msi$/);
    expect(installerFor('appimage', 'x64', assets)).toMatch(/\.AppImage$/);
    expect(installerFor('deb', 'x64', assets)).toMatch(/amd64\.deb$/);
    expect(installerFor('dmg', 'arm64', assets)).toMatch(/arm64\.dmg$/);
    expect(installerFor('dmg', 'x64', assets)).toMatch(/x64\.dmg$/);
    expect(installerFor('dev', 'x64', assets)).toBeNull();
  });

  it('is null while the installers are not uploaded yet', () => {
    expect(installerFor('nsis', 'x64', [download('latest.yml')])).toBeNull();
  });

  it('never leads outside the releases of the project', () => {
    const foreign = { name: 'MosPolytech-Records-Setup-x64.exe', url: 'https://evil.test/MosPolytech-Records-Setup-x64.exe' };
    expect(installerFor('nsis', 'x64', [foreign])).toBeNull();
  });
});

describe('installKind', () => {
  const runtime = { packaged: true, platform: 'linux' as NodeJS.Platform, appImage: false, uninstaller: false };

  it('tells the builds apart', () => {
    expect(installKind({ ...runtime, packaged: false })).toBe('dev');
    expect(installKind({ ...runtime, platform: 'win32', uninstaller: true })).toBe('nsis');
    expect(installKind({ ...runtime, platform: 'win32' })).toBe('msi');
    expect(installKind({ ...runtime, platform: 'darwin' })).toBe('dmg');
    expect(installKind({ ...runtime, appImage: true })).toBe('appimage');
    expect(installKind(runtime)).toBe('deb');
  });

  it('lets only the .exe and the AppImage replace themselves', () => {
    expect(selfUpdating('nsis')).toBe(true);
    expect(selfUpdating('appimage')).toBe(true);
    expect(selfUpdating('msi')).toBe(false);
    expect(selfUpdating('deb')).toBe(false);
    expect(selfUpdating('dmg')).toBe(false);
  });
});

describe('canInstallNow', () => {
  const now = Date.UTC(2026, 10, 16, 12);
  const quiet: Moment = { mode: 'auto', stage: 'ready', recorder: 'idle', nextLessonAt: null, windowVisible: false, now };

  it('installs when nobody would notice', () => {
    expect(canInstallNow(quiet)).toBe(true);
    expect(canInstallNow({ ...quiet, nextLessonAt: now + QUIET_BEFORE_LESSON + 60_000 })).toBe(true);
  });

  it('waits for a lesson that is on or close', () => {
    expect(canInstallNow({ ...quiet, recorder: 'recording' })).toBe(false);
    expect(canInstallNow({ ...quiet, nextLessonAt: now + 10 * 60_000 })).toBe(false);
  });

  it('does not restart under the user or against the settings', () => {
    expect(canInstallNow({ ...quiet, windowVisible: true })).toBe(false);
    expect(canInstallNow({ ...quiet, mode: 'ask' })).toBe(false);
    expect(canInstallNow({ ...quiet, mode: 'notify' })).toBe(false);
    expect(canInstallNow({ ...quiet, stage: 'downloading' })).toBe(false);
  });
});

describe('shouldShowWhatsNew', () => {
  it('tells after an update only', () => {
    expect(shouldShowWhatsNew('0.3.1', '0.4.0', true)).toBe(true);
    expect(shouldShowWhatsNew('0.4.0', '0.4.0', true)).toBe(false);
    expect(shouldShowWhatsNew('0.5.0', '0.4.0', true)).toBe(false);
  });

  it('treats an unknown previous version by whether the app was set up', () => {
    // Updated from a version that did not keep track yet.
    expect(shouldShowWhatsNew('', '0.4.0', true)).toBe(true);
    // A fresh install.
    expect(shouldShowWhatsNew('', '0.4.0', false)).toBe(false);
  });
});

describe('fetchRelease', () => {
  it('reads the latest release from the GitHub API', async () => {
    let path = '';
    const { url } = await serve((request, response) => {
      path = request.url ?? '';
      json(response, {
        tag_name: 'v0.3.1',
        body,
        assets: [{ name: 'latest.yml', browser_download_url: `${REPO_URL}/releases/download/v0.3.1/latest.yml` }],
      });
    });
    const release = await fetchRelease(undefined, url.replace(/\/$/, ''));
    expect(path).toBe('/releases/latest');
    expect(release).toEqual({
      version: '0.3.1',
      notes: parseNotes(body),
      assets: [{ name: 'latest.yml', url: `${REPO_URL}/releases/download/v0.3.1/latest.yml` }],
    });
  });

  it('asks for a version by its tag and is null when there is none', async () => {
    let path = '';
    const { url } = await serve((request, response) => {
      path = request.url ?? '';
      json(response, { message: 'Not Found' }, 404);
    });
    expect(await fetchRelease('0.4.0', url.replace(/\/$/, ''))).toBeNull();
    expect(path).toBe('/releases/tags/v0.4.0');
  });

  it('refuses an answer that is not a release', async () => {
    const { url } = await serve((_request, response) => json(response, { tag_name: 'nightly' }));
    const error: unknown = await fetchRelease(undefined, url.replace(/\/$/, '')).catch((reason: unknown) => reason);
    expect(error).toBeInstanceOf(NetError);
  });
});
