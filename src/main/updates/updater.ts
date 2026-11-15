import electronUpdater, { type AppUpdater } from 'electron-updater';
import { REPO_URL, type UpdateMode, type UpdateState } from '@shared/types';
import { logError, logInfo } from '../log';
import { NetError } from '../net';
import { selfUpdating } from './policy';
import { fetchRelease, installerFor, isNewer, releasePage, type InstallKind } from './release';

const CHECK_EVERY = 6 * 60 * 60_000;
/** GitHub allows 60 anonymous requests an hour: a button pressed in a row asks once. */
const MIN_GAP = 60_000;
/** After a failed check, or while a fresh release has no installers yet. */
const RETRY_AFTER = 10 * 60_000;

export interface UpdaterOptions {
  current: string;
  kind: InstallKind;
  /** Of the machine, not of the process: an x64 build under Rosetta wants the arm64 installer. */
  arch: string;
  mode: () => UpdateMode;
  /** A lesson is on: the download waits, the webinar needs the connection more. */
  busy: () => boolean;
  /** The app has just been updated: fetch what is new in `current`. */
  whatsNew: boolean;
  /** Called once the user has seen what is new, or there is nothing to show. */
  onSeen: () => void;
}

function explain(error: unknown): string {
  if (!(error instanceof NetError)) return 'Не удалось проверить обновления';
  switch (error.kind) {
    case 'offline':
    case 'timeout':
      return 'Нет связи с GitHub — проверю ещё раз позже';
    case 'status':
      return error.status === 403 || error.status === 429
        ? 'GitHub просит подождать: слишком много запросов. Проверю ещё раз позже'
        : `GitHub ответил ошибкой ${error.status ?? ''}`.trim();
    default:
      return 'GitHub ответил что-то непонятное';
  }
}

/**
 * Finds new versions on GitHub and, where the build can replace itself, downloads them.
 * It never restarts the app on its own: `install` is called by whoever knows it is a good moment.
 */
export class Updater {
  private value: UpdateState;
  private readonly listeners = new Set<(state: UpdateState) => void>();
  private readonly self: boolean;
  private engine: AppUpdater | null = null;
  private timer: NodeJS.Timeout | null = null;
  private retry: NodeJS.Timeout | null = null;
  private checking: Promise<UpdateState> | null = null;
  private wantNotes: boolean;
  private stopped = false;

  constructor(private readonly options: UpdaterOptions) {
    this.self = selfUpdating(options.kind);
    this.wantNotes = options.whatsNew;
    this.value = {
      current: options.current,
      latest: null,
      stage: 'idle',
      percent: null,
      notes: [],
      url: `${REPO_URL}/releases/latest`,
      checkedAt: null,
      error: null,
      selfUpdating: this.self,
      whatsNew: null,
    };
  }

  onChange(listener: (state: UpdateState) => void): void {
    this.listeners.add(listener);
  }

  state(): UpdateState {
    return structuredClone(this.value);
  }

  /** Checks now and then every few hours. */
  start(): void {
    void this.check();
    this.timer = setInterval(() => void this.check(), CHECK_EVERY);
  }

  /** No more background checks; used on quit. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    if (this.retry) clearTimeout(this.retry);
    this.timer = null;
    this.retry = null;
  }

  /** Asks GitHub for the latest release. Never throws: a failure is told in `error` of the state. */
  check(): Promise<UpdateState> {
    this.checking ??= this.run().finally(() => {
      this.checking = null;
    });
    return this.checking;
  }

  /** Fetches the new version. Never throws: after a failure the state is `available` again, with `error`. */
  async download(): Promise<void> {
    if (this.value.stage !== 'available') return;
    this.set({ stage: 'downloading', percent: 0, error: null });
    try {
      await this.native().downloadUpdate();
      this.set({ stage: 'ready', percent: null });
    } catch (error) {
      logError('Update download failed', error);
      this.set({
        stage: 'available',
        percent: null,
        error: 'Не удалось скачать обновление. Попробую ещё раз позже — или скачай установщик вручную',
      });
    }
  }

  /** Starts a download that was put off: a lesson has ended, or the user allowed downloads. */
  resume(): void {
    if (this.value.stage !== 'available' || this.options.mode() === 'notify' || this.options.busy()) return;
    void this.download();
  }

  /**
   * Hands the downloaded update to the installer, which quits the app (and starts it again
   * if `restart`). Returns `false` when there is nothing to install.
   */
  install(restart: boolean): boolean {
    if (this.value.stage !== 'ready') return false;
    this.native().quitAndInstall(true, restart);
    return true;
  }

  dismissWhatsNew(): void {
    this.wantNotes = false;
    if (this.value.whatsNew) this.set({ whatsNew: null });
    this.options.onSeen();
  }

  private async run(): Promise<UpdateState> {
    await this.loadWhatsNew();
    const before = this.value;
    // A download in progress or done is the newest thing worth knowing until the restart.
    if (before.stage === 'downloading' || before.stage === 'ready') return this.state();
    if (before.checkedAt !== null && before.error === null && Date.now() - before.checkedAt < MIN_GAP) return this.state();

    this.set({ stage: 'checking', error: null });
    try {
      const release = await fetchRelease();
      const checkedAt = Date.now();
      const installer = release ? installerFor(this.options.kind, this.options.arch, release.assets) : null;
      const newer = release !== null && isNewer(release.version, this.options.current);
      // A release is published before its installers are built: until then there is nothing to offer.
      if (!release || !newer || (!installer && this.options.kind !== 'dev')) {
        if (newer) this.again();
        this.set({ stage: 'idle', latest: null, notes: [], percent: null, checkedAt, error: null });
        return this.state();
      }
      const found = {
        latest: release.version,
        notes: release.notes,
        url: installer ?? releasePage(release.version),
        percent: null,
        checkedAt,
        error: null,
      };
      if (!this.self || !(await this.confirmed())) {
        this.set({ ...found, stage: 'manual' });
        return this.state();
      }
      this.set({ ...found, stage: 'available' });
      this.resume();
    } catch (error) {
      logError('Update check failed', error);
      this.again();
      // What was known before the failed check is still true.
      if (before.latest !== null) this.set({ stage: before.stage, error: before.error });
      else this.set({ stage: 'error', error: explain(error) });
    }
    return this.state();
  }

  /**
   * electron-updater reads its own manifest (`latest*.yml`) from the release; only what it
   * agrees to download is offered as a one-click update, anything else as a plain link.
   */
  private async confirmed(): Promise<boolean> {
    try {
      const result = await this.native().checkForUpdates();
      return result?.isUpdateAvailable === true;
    } catch (error) {
      logError('Updater: the update manifest could not be read', error);
      return false;
    }
  }

  /** What is new in the running version, shown once after an update. */
  private async loadWhatsNew(): Promise<void> {
    if (!this.wantNotes) return;
    try {
      const release = await fetchRelease(this.options.current);
      if (!this.wantNotes) return;
      this.wantNotes = false;
      if (release?.notes.length) this.set({ whatsNew: release.notes });
      else this.options.onSeen();
    } catch (error) {
      // Not worth an error on the screen; the next check tries again.
      logError('Could not load the notes of this version', error);
    }
  }

  private again(): void {
    if (this.stopped || this.retry) return;
    this.retry = setTimeout(() => {
      this.retry = null;
      void this.check();
    }, RETRY_AFTER);
  }

  /** Created on first use: only builds that update themselves ever touch electron-updater. */
  private native(): AppUpdater {
    if (this.engine) return this.engine;
    const engine = electronUpdater.autoUpdater;
    // Downloading and installing are our calls: never during a lesson, never by surprise.
    engine.autoDownload = false;
    engine.autoInstallOnAppQuit = false;
    engine.logger = {
      info: (message?: unknown) => logInfo(`Updater: ${String(message)}`),
      warn: (message?: unknown) => logInfo(`Updater: ${String(message)}`),
      error: (message?: unknown) => logError(`Updater: ${String(message)}`),
    };
    engine.on('download-progress', (progress) => {
      const percent = Math.floor(progress.percent);
      if (this.value.stage === 'downloading' && percent !== this.value.percent) this.set({ percent });
    });
    this.engine = engine;
    return engine;
  }

  private set(patch: Partial<UpdateState>): void {
    this.value = { ...this.value, ...patch };
    for (const listener of this.listeners) listener(this.state());
  }
}
