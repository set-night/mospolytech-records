import { join } from 'node:path';
import { app, BrowserWindow, Notification, powerMonitor, powerSaveBlocker, shell } from 'electron';
import { APP_NAME, LESSON_BYTES } from '@shared/types';
import { applyAutoStart, startedHidden } from './autostart';
import { registerIpc, send, type Context } from './ipc';
import { initLog, logError, logInfo } from './log';
import { handleMedia, registerMediaScheme } from './media';
import { loadPage, preloadPath } from './pages';
import { Recorder } from './recorder/recorder';
import { freeSpace } from './recordings/disk';
import { cleanupRecordings } from './recordings/library';
import { ScheduleService } from './schedule/service';
import { defaultFolder, SettingsStore } from './settings/store';
import { AppTray, iconPath } from './tray';
import { Updater } from './updates';

app.setName(APP_NAME);
if (process.platform === 'win32') app.setAppUserModelId('io.github.set-night.mospolytech-records');
registerMediaScheme();

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void main();
}

async function main(): Promise<void> {
  let window: BrowserWindow | null = null;
  let quitting = false;

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
  const context: Context = { settings, schedule, recorder, updater, window: () => window, logFile, quit: (restart) => quit(restart) };

  function open(page?: string): void {
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({
        width: 1180,
        height: 780,
        minWidth: 900,
        minHeight: 600,
        show: false,
        title: APP_NAME,
        backgroundColor: '#171717',
        icon: iconPath('icon.png'),
        autoHideMenuBar: true,
        webPreferences: { preload: preloadPath('index'), sandbox: true, contextIsolation: true },
      });
      window.once('ready-to-show', () => window?.show());
      // Closing hides to the tray: recordings must keep going.
      window.on('close', (event) => {
        if (quitting) return;
        event.preventDefault();
        window?.hide();
      });
      window.webContents.setWindowOpenHandler(({ url }) => {
        if (url.startsWith('https://')) void shell.openExternal(url);
        return { action: 'deny' };
      });
      window.webContents.on('will-navigate', (event) => event.preventDefault());
      void loadPage(window, 'index', page);
      return;
    }
    if (page) send(context, 'navigate', page);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  async function quit(restart = false): Promise<void> {
    if (quitting) return;
    quitting = true;
    schedule.stop();
    updater.stop();
    await recorder.shutdown();
    // A downloaded update is installed on the way out, never during a lesson.
    if (!updater.install(restart)) app.exit(0);
  }

  function notify(title: string, body: string, page?: string, options: { silent?: boolean; always?: boolean } = {}): void {
    logInfo(`Notification: ${title} — ${body}`);
    if (!Notification.isSupported() || (!options.always && !settings.get().notifications)) return;
    const notification = new Notification({ title, body, silent: options.silent ?? false });
    if (page) notification.on('click', () => open(page));
    notification.show();
  }

  let lowSpaceWarned = false;
  async function checkSpace(): Promise<void> {
    const { folder, quality } = settings.get();
    const free = await freeSpace(folder);
    if (free === null) return;
    const low = free < 2 * LESSON_BYTES[quality];
    if (low && !lowSpaceWarned) {
      notify('Мало места на диске', 'Осталось меньше чем на две пары. Освободи место или выбери другую папку в настройках.', 'settings', { always: true });
    }
    lowSpaceWarned = low;
  }

  registerIpc(context);
  handleMedia(() => settings.get().folder);

  const tray = new AppTray({
    open,
    stop: () => void recorder.stopCurrent(),
    openFolder: () => void shell.openPath(settings.get().folder),
    update: () => {
      if (recorder.status().state === 'idle') void quit(true);
    },
    quit: () => void quit(),
  });
  let spaceTimer: NodeJS.Timeout | null = null;
  let blocker: number | null = null;
  let lastFile: string | null = null;
  let lastLogged = '';
  recorder.onStatus((status) => {
    const line = `${status.state}${status.lesson ? ` «${status.lesson.subject}» ${status.lesson.date} ${status.lesson.startTime}` : ''}${status.message ? ` — ${status.message}` : ''}`;
    if (line !== lastLogged) logInfo(`Recorder: ${line}`);
    lastLogged = line;
    tray.update(status);
    send(context, 'status', status);
    const active = status.state !== 'idle';
    if (active && !spaceTimer) {
      void checkSpace();
      spaceTimer = setInterval(() => void checkSpace(), 5 * 60_000);
    }
    if (!active && spaceTimer) {
      clearInterval(spaceTimer);
      spaceTimer = null;
    }
    // Keep the computer awake while a lesson is joined or recorded.
    if (active && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!active && blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
    if (status.file !== lastFile) {
      if (status.file) notify('Запись началась', status.lesson?.subject ?? '', 'status', { silent: true });
      lastFile = status.file;
      send(context, 'recordings', null);
    }
  });
  recorder.onFinished(({ lesson, file, message }) => {
    logInfo(`Finished «${lesson.subject}»: ${file ?? `not recorded (${message ?? 'no reason'})`}`);
    if (file) notify('Запись сохранена', lesson.subject, 'recordings');
    else notify('Пара не записана', `${lesson.subject}${message ? ` — ${message}` : ''}`, 'status');
  });
  updater.onChange((info) => {
    logInfo(`Update ${info.latest}: ${info.stage}${info.stage === 'downloading' ? ` ${info.percent ?? 0}%` : ''}`);
    send(context, 'update', info);
    tray.updateReady(info.stage === 'ready' ? info.latest : null);
  });
  let scheduleError: string | null = null;
  schedule.onChange((state) => {
    if (state.error && state.error !== scheduleError) logError(`Schedule: ${state.error}`);
    scheduleError = state.error;
    send(context, 'schedule', state);
  });

  async function cleanup(): Promise<void> {
    const { folder, keepDays } = settings.get();
    try {
      const removed = await cleanupRecordings(folder, keepDays, Date.now(), recorder.status().file, (path) => shell.trashItem(path));
      if (!removed) return;
      logInfo(`Cleanup: ${removed} recording(s) older than ${keepDays} days moved to the trash`);
      send(context, 'recordings', null);
    } catch (error) {
      logError('Cleanup failed', error);
    }
  }
  setInterval(() => void cleanup(), 6 * 60 * 60_000);
  let autoStart = settings.get().autoStart;
  applyAutoStart(autoStart);
  let keepDays = settings.get().keepDays;
  settings.onChange((value) => {
    send(context, 'settings', value);
    if (value.keepDays !== keepDays) {
      keepDays = value.keepDays;
      void cleanup();
    }
    if (value.autoStart !== autoStart) applyAutoStart((autoStart = value.autoStart));
  });

  // After sleep the timetable may be stale and a lesson may already be on.
  powerMonitor.on('resume', () => {
    logInfo('System resumed');
    void schedule.refresh().catch(() => undefined);
    recorder.start();
  });

  app.on('second-instance', () => open());
  app.on('activate', () => open());
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
  tray.update(recorder.status());
  if (!startedHidden() || !settings.get().onboarded) open();
  updater.start();
}
