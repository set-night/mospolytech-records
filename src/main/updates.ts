import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app } from 'electron';
import electronUpdater from 'electron-updater';
import { APP_NAME, REPO_URL, type UpdateInfo, type UpdateStage } from '@shared/types';

const API = REPO_URL.replace('https://github.com/', 'https://api.github.com/repos/') + '/releases/latest';
const CHECK_EVERY = 6 * 60 * 60_000;

function parts(version: string): number[] {
  return version.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff) return diff > 0;
  }
  return false;
}

/**
 * Version of the latest GitHub release, without the `v`. A release still waiting for its
 * installers (CI builds them for a few minutes after it appears) does not count.
 */
export async function latestRelease(): Promise<string | null> {
  const response = await fetch(API, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'mospolytech-records' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { tag_name?: unknown; assets?: unknown };
  if (!Array.isArray(body.assets) || body.assets.length === 0) return null;
  return typeof body.tag_name === 'string' ? body.tag_name.replace(/^v/, '') : null;
}

/**
 * Self-updating works without a code signature only for the NSIS installer and the AppImage.
 * The msi installs into Program Files without the NSIS uninstaller next to the exe.
 */
function selfUpdating(): boolean {
  if (!app.isPackaged) return false;
  if (process.platform === 'linux') return !!process.env.APPIMAGE;
  if (process.platform === 'win32') return existsSync(join(dirname(process.execPath), `Uninstall ${APP_NAME}.exe`));
  return false;
}

/**
 * Checks for a new release every few hours. Where possible it downloads the update in the
 * background and installs it on the next quit; elsewhere it points to the release page.
 */
export class Updater {
  private info: UpdateInfo | null = null;
  private timer: NodeJS.Timeout | null = null;
  private readonly auto = selfUpdating();
  private readonly listeners = new Set<(info: UpdateInfo) => void>();

  constructor(private readonly current: string) {
    if (!this.auto) return;
    const { autoUpdater } = electronUpdater;
    autoUpdater.logger = null;
    autoUpdater.autoDownload = true;
    // Installing is our call: never in the middle of a recording.
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.on('update-available', (release) => this.set(release.version, 'downloading', 0));
    autoUpdater.on('download-progress', (progress) => {
      if (this.info?.stage === 'downloading') this.set(this.info.latest, 'downloading', Math.round(progress.percent));
    });
    autoUpdater.on('update-downloaded', (release) => this.set(release.version, 'ready', null));
    autoUpdater.on('error', () => {
      if (this.info?.stage === 'downloading') this.set(this.info.latest, 'manual', null);
    });
  }

  onChange(listener: (info: UpdateInfo) => void): void {
    this.listeners.add(listener);
  }

  state(): UpdateInfo | null {
    return this.info;
  }

  get ready(): boolean {
    return this.info?.stage === 'ready';
  }

  start(): void {
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async check(): Promise<UpdateInfo | null> {
    if (this.info && this.info.stage !== 'manual') return this.info;
    if (this.auto) {
      try {
        await electronUpdater.autoUpdater.checkForUpdates();
        if (this.info) return this.info;
      } catch {
        // Falls back to the release page below.
      }
    }
    const latest = await latestRelease().catch(() => null);
    if (latest && isNewer(latest, this.current)) this.set(latest, 'manual', null);
    return this.info;
  }

  /** Quits and installs the downloaded update; `false` when there is nothing to install. */
  install(restart: boolean): boolean {
    if (!this.ready) return false;
    electronUpdater.autoUpdater.quitAndInstall(true, restart);
    return true;
  }

  private set(latest: string, stage: UpdateStage, percent: number | null): void {
    this.info = { current: this.current, latest, url: `${REPO_URL}/releases/tag/v${latest}`, stage, percent };
    for (const listener of this.listeners) listener(this.info);
  }
}
