import { join } from 'node:path';
import { app, Menu, nativeImage, Tray, type NativeImage } from 'electron';
import { APP_NAME, type RecorderStatus } from '@shared/types';

export function iconPath(name: string): string {
  const base = app.isPackaged ? join(process.resourcesPath, 'icons') : join(app.getAppPath(), 'resources', 'icons');
  return join(base, name);
}

function image(recording: boolean): NativeImage {
  // macOS menu bar wants a monochrome template image that follows the theme.
  if (process.platform === 'darwin' && !recording) {
    const template = nativeImage.createFromPath(iconPath('trayTemplate.png'));
    template.setTemplateImage(true);
    return template;
  }
  return nativeImage.createFromPath(iconPath(recording ? 'tray-recording.png' : 'tray.png'));
}

export function describe(status: RecorderStatus): string {
  const lesson = status.lesson;
  switch (status.state) {
    case 'recording': return `Идёт запись: ${lesson?.subject ?? ''}`;
    case 'joining': return `Подключаюсь: ${lesson?.subject ?? ''}`;
    case 'waiting': return `Жду начала: ${lesson?.subject ?? ''}`;
    default: {
      const next = status.next;
      return next ? `Следующая запись: ${next.date.slice(8, 10)}.${next.date.slice(5, 7)} ${next.startTime} — ${next.subject}` : 'Записей по расписанию нет';
    }
  }
}

export interface TrayActions {
  open(page?: string): void;
  stop(): void;
  openFolder(): void;
  /** Restarts into a downloaded update. */
  update(): void;
  /** Gets a found update: downloads it, or opens the installer of a build that cannot update itself. */
  getUpdate(): void;
  checkUpdates(): void;
  quit(): void;
}

/** A newer version the tray can offer; `ready` once it is downloaded and waits for a restart. */
export interface UpdateOffer {
  version: string;
  ready: boolean;
}

export class AppTray {
  private readonly tray: Tray;
  private recording = false;
  private status: RecorderStatus | null = null;
  private offered: UpdateOffer | null = null;
  /** What the menu shows now; the recorder reports far more often than it changes. */
  private shown = '';

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(image(false));
    this.tray.setToolTip(APP_NAME);
    this.tray.on('click', () => actions.open());
  }

  /** Offers a newer version: a restart into it once it is downloaded, a download before. */
  offer(update: UpdateOffer | null): void {
    this.offered = update;
    if (this.status) this.update(this.status);
  }

  update(status: RecorderStatus): void {
    this.status = status;
    const recording = status.state === 'recording';
    if (recording !== this.recording) {
      this.recording = recording;
      this.tray.setImage(image(recording));
    }
    const line = describe(status);
    const active = status.state !== 'idle';
    const offered = this.offered;
    const shown = JSON.stringify([line, active, offered]);
    if (shown === this.shown) return;
    this.shown = shown;
    this.tray.setToolTip(`${APP_NAME}\n${line}`);
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: line, enabled: false },
      { type: 'separator' },
      { label: 'Открыть', click: () => this.actions.open() },
      { label: 'Что записывается сейчас', enabled: active, click: () => this.actions.open('status') },
      { label: 'Расписание', click: () => this.actions.open('schedule') },
      { label: 'Записи', click: () => this.actions.open('recordings') },
      { label: 'Открыть папку с записями', click: () => this.actions.openFolder() },
      { label: 'Остановить запись', enabled: active, click: () => this.actions.stop() },
      { type: 'separator' },
      offered?.ready
        ? { label: `Перезапустить и обновить до ${offered.version}`, enabled: !active, click: () => this.actions.update() }
        : offered
          ? { label: `Скачать версию ${offered.version}`, click: () => this.actions.getUpdate() }
          : { label: 'Проверить обновления', click: () => this.actions.checkUpdates() },
      { label: 'Выйти', click: () => this.actions.quit() },
    ]));
  }
}
