import { join } from 'node:path';
import { app, powerMonitor, shell } from 'electron';
import { APP_NAME } from '@shared/types';
import { applyAutoStart, startedHidden } from './autostart';
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
import { Updater } from './updates';
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
  const schedule = new ScheduleService(join(data, 'schedule.json'), () => settings.get().group);
  const recorder = new Recorder(settings, schedule);
  const updater = new Updater(app.getVersion());
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
    if (!installing) app.exit(0);
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
    quit: () => void quit(),
  });

  reactToRecorder(recorder, notifier, () => window.send('recordings', null));
  recorder.onStatus((status) => {
    tray.update(status);
    window.send('status', status);
    space.watch(status.state !== 'idle');
  });
  updater.onChange((info) => {
    logInfo(`Update ${info.latest}: ${info.stage}${info.stage === 'downloading' ? ` ${info.percent ?? 0}%` : ''}`);
    window.send('update', info);
    tray.updateReady(info.stage === 'ready' ? info.latest : null);
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
  });

  // After sleep the timetable may be stale and a lesson may already be on.
  powerMonitor.on('resume', () => {
    logInfo('System resumed');
    void schedule.refresh();
    recorder.start();
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
  if (!startedHidden() || !settings.get().onboarded) window.open();
  updater.start();
}
