import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { app, powerMonitor, shell } from 'electron';
import { APP_NAME } from '@shared/types';
import { applyAutoStart, leaveHiddenMark, startedHidden, takeHiddenMark } from './autostart';
import { registerIpc } from './ipc';
import { initLog, logError, logInfo } from './log';
import { handleMedia, registerMediaScheme } from './media';
import { Notifier } from './notifier';
import { reactToRecorder } from './recorder/reactions';
import { Recorder } from './recorder/recorder';
import { cleanupRecordings } from './recordings/library';
import { SpaceWatch } from './recordings/space';
import { ScheduleService } from './schedule/service';
import { defaultFolder, SettingsStore } from './settings/store';
import { AppTray } from './tray';
import { installKind, shouldShowWhatsNew } from './updates/policy';
import { reactToUpdates } from './updates/reactions';
import { Updater } from './updates/updater';
import { MainWindow } from './window';

const CLEANUP_EVERY = 6 * 60 * 60_000;

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('io.github.set-night.mospolytech-records');
registerMediaScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

/** The composition root: builds the parts of the app and wires them to each other. */
async function main(): Promise<void> {
  await app.whenReady();
  const data = app.getPath('userData');
  const logFile = initLog(app.getPath('logs'));
  logInfo(`${APP_NAME} ${app.getVersion()} on ${process.platform} ${process.arch}`);
  process.on('uncaughtException', (error) => logError('Uncaught exception', error));
  process.on('unhandledRejection', (error) => logError('Unhandled rejection', error));

  const settings = new SettingsStore(join(data, 'settings.json'), defaultFolder(app.getPath('documents')));
  if (settings.damaged) logError(`Settings could not be read, starting from defaults; the old file is kept as ${settings.damaged}`);
  const schedule = new ScheduleService(join(data, 'schedule.json'), () => settings.get().group);
  const recorder = new Recorder(settings, schedule);

  const current = app.getVersion();
  const hiddenMark = join(data, 'restart-hidden');
  // Back from a quiet update: stay in the tray, as before it.
  const quiet = takeHiddenMark(hiddenMark);
  const { seenVersion, onboarded } = settings.get();
  const whatsNew = shouldShowWhatsNew(seenVersion, current, onboarded);
  // A fresh install or a step back: nothing to tell, but the next update must know where it came from.
  if (!whatsNew && seenVersion !== current) settings.update({ seenVersion: current });
  const kind = installKind({
    packaged: app.isPackaged,
    platform: process.platform,
    appImage: Boolean(process.env.APPIMAGE),
    uninstaller: process.platform === 'win32' && existsSync(join(dirname(process.execPath), `Uninstall ${APP_NAME}.exe`)),
  });
  const updater = new Updater({
    current,
    kind,
    // An x64 build under Rosetta should be offered the arm64 installer.
    arch: app.runningUnderARM64Translation ? 'arm64' : process.arch,
    mode: () => settings.get().updates,
    busy: () => recorder.status().state !== 'idle',
    whatsNew,
    onSeen: () => settings.update({ seenVersion: current }),
  });
  logInfo(`Install kind: ${kind}${whatsNew ? `, updated from ${seenVersion || 'an older version'}` : ''}`);
  const window = new MainWindow();
  const notifier = new Notifier(() => settings.get().notifications, (page) => window.open(page));
  const space = new SpaceWatch(() => settings.get(), () => notifier.show(
    'Мало места на диске',
    'Осталось меньше чем на две пары. Освободи место или выбери другую папку в настройках.',
    { page: 'settings', always: true },
  ));

  let quitting = false;
  async function quit(restart = false): Promise<void> {
    if (quitting) return;
    quitting = true;
    window.release();
    schedule.stop();
    updater.stop();
    try {
      await recorder.shutdown();
    } catch (error) {
      logError('Recorder did not shut down cleanly', error);
    }
    // A downloaded update is installed on the way out, never during a lesson.
    let installing = false;
    try {
      installing = updater.install(restart);
    } catch (error) {
      logError('Could not install the update', error);
    }
    if (installing) return;
    // Nothing to install after all: still keep the promise of a restart.
    if (restart) app.relaunch(process.env.APPIMAGE ? { execPath: process.env.APPIMAGE, args: process.argv.slice(1) } : undefined);
    app.exit(0);
  }

  async function cleanup(): Promise<void> {
    const { folder, keepDays } = settings.get();
    try {
      const removed = await cleanupRecordings(folder, keepDays, Date.now(), recorder.status().file, (path) => shell.trashItem(path));
      if (!removed) return;
      logInfo(`Cleanup: ${removed} recording(s) older than ${keepDays} days moved to the trash`);
      window.send('recordings', null);
    } catch (error) {
      logError('Cleanup failed', error);
    }
  }

  function autoStart(enabled: boolean): void {
    try {
      applyAutoStart(enabled);
    } catch (error) {
      logError('Could not change autostart', error);
    }
  }

  registerIpc({ settings, schedule, recorder, updater, window, logFile, quit });
  handleMedia(() => settings.get().folder);

  const tray = new AppTray({
    open: (page) => window.open(page),
    stop: () => void recorder.stopCurrent(),
    openFolder: () => void shell.openPath(settings.get().folder),
    update: () => {
      if (recorder.status().state === 'idle') void quit(true);
    },
    getUpdate: () => {
      const state = updater.state();
      if (state.stage === 'manual') void shell.openExternal(state.url);
      else {
        window.open('about');
        void updater.download();
      }
    },
    checkUpdates: () => {
      window.open('about');
      void updater.check();
    },
    quit: () => void quit(),
  });

  reactToRecorder(recorder, notifier, () => window.send('recordings', null));
  recorder.onStatus((status) => {
    tray.update(status);
    window.send('status', status);
    space.watch(status.state !== 'idle');
  });
  reactToUpdates({
    updater,
    recorder,
    notifier,
    window,
    tray,
    settings: () => settings.get(),
    announce: (version) => settings.update({ announcedVersion: version }),
    installQuietly: () => {
      try {
        leaveHiddenMark(hiddenMark);
      } catch (error) {
        logError('Could not leave the mark for a hidden restart', error);
      }
      void quit(true);
    },
  });
  let scheduleError: string | null = null;
  schedule.onChange((state) => {
    if (state.error && state.error !== scheduleError) logError(`Schedule: ${state.error}`);
    scheduleError = state.error;
    window.send('schedule', state);
  });

  let previous = settings.get();
  autoStart(previous.autoStart);
  settings.onChange((value) => {
    const before = previous;
    previous = value;
    window.send('settings', value);
    // A new group has its own timetable; without this the old one would stay until the hourly refresh.
    if (value.group !== before.group) void schedule.refresh();
    if (value.keepDays !== before.keepDays || value.folder !== before.folder) void cleanup();
    if (value.autoStart !== before.autoStart) autoStart(value.autoStart);
    // Downloads were allowed: the version found earlier can come now.
    if (value.updates !== before.updates) updater.resume();
  });

  // After sleep the timetable may be stale and a lesson may already be on.
  powerMonitor.on('resume', () => {
    logInfo('System resumed');
    void schedule.refresh();
    recorder.start();
    void updater.check();
  });

  app.on('second-instance', () => window.open());
  app.on('activate', () => window.open());
  app.on('window-all-closed', () => {
    // Stay in the tray.
  });
  app.on('before-quit', (event) => {
    if (quitting) return;
    event.preventDefault();
    void quit();
  });

  schedule.start();
  recorder.start();
  void cleanup();
  setInterval(() => void cleanup(), CLEANUP_EVERY);
  tray.update(recorder.status());
  if ((!startedHidden() && !quiet) || !settings.get().onboarded) window.open();
  if (quiet && whatsNew) notifier.show(`Обновлено до ${current}`, 'Нажми, чтобы посмотреть, что нового.', { page: 'status', silent: true });
  updater.start();
}
