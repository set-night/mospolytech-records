import { join } from 'node:path';
import { app, BrowserWindow, Notification, powerSaveBlocker, shell } from 'electron';
import { APP_NAME } from '@shared/types';
import { applyAutoStart, startedHidden } from './autostart';
import { registerIpc, send, type Context } from './ipc';
import { handleMedia, registerMediaScheme } from './media';
import { loadPage, preloadPath } from './pages';
import { Recorder } from './recorder/recorder';
import { ScheduleService } from './schedule/service';
import { defaultFolder, SettingsStore } from './settings/store';
import { AppTray, iconPath } from './tray';
import { checkUpdates } from './updates';

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
  const settings = new SettingsStore(join(data, 'settings.json'), defaultFolder(app.getPath('documents')));
  const schedule = new ScheduleService(join(data, 'schedule.json'), () => settings.get().group);
  const recorder = new Recorder(settings, schedule);
  const context: Context = { settings, schedule, recorder, window: () => window };

  function open(page?: string): void {
    if (!window || window.isDestroyed()) {
      window = new BrowserWindow({
        width: 1180,
        height: 780,
        minWidth: 900,
        minHeight: 600,
        show: false,
        title: APP_NAME,
        backgroundColor: '#0f1020',
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

  async function quit(): Promise<void> {
    quitting = true;
    schedule.stop();
    await recorder.shutdown();
    app.exit(0);
  }

  registerIpc(context);
  handleMedia(() => settings.get().folder);

  const tray = new AppTray({ open, stop: () => void recorder.stopCurrent(), quit: () => void quit() });
  let blocker: number | null = null;
  let lastFile: string | null = null;
  recorder.onStatus((status) => {
    tray.update(status);
    send(context, 'status', status);
    const active = status.state !== 'idle';
    // Keep the computer awake while a lesson is joined or recorded.
    if (active && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!active && blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }
    if (status.file !== lastFile) {
      if (status.file && Notification.isSupported()) {
        new Notification({ title: 'Запись началась', body: status.lesson?.subject ?? '', silent: true }).show();
      }
      lastFile = status.file;
      send(context, 'recordings', null);
    }
  });
  schedule.onChange((state) => send(context, 'schedule', state));
  let autoStart = settings.get().autoStart;
  applyAutoStart(autoStart);
  settings.onChange((value) => {
    send(context, 'settings', value);
    if (value.autoStart !== autoStart) applyAutoStart((autoStart = value.autoStart));
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
  tray.update(recorder.status());
  if (!startedHidden() || !settings.get().onboarded) open();

  const update = await checkUpdates(app.getVersion()).catch(() => null);
  if (update) send(context, 'update', update);
}
