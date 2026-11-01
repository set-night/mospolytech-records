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
  quit(): void;
}

export class AppTray {
  private readonly tray: Tray;
  private recording = false;

  constructor(private readonly actions: TrayActions) {
    this.tray = new Tray(image(false));
    this.tray.setToolTip(APP_NAME);
    this.tray.on('click', () => actions.open());
  }

  update(status: RecorderStatus): void {
    const recording = status.state === 'recording';
    if (recording !== this.recording) {
      this.recording = recording;
      this.tray.setImage(image(recording));
    }
    const line = describe(status);
    this.tray.setToolTip(`${APP_NAME}\n${line}`);
    const active = status.state !== 'idle';
    this.tray.setContextMenu(Menu.buildFromTemplate([
      { label: line, enabled: false },
      { type: 'separator' },
      { label: 'Открыть', click: () => this.actions.open() },
      { label: 'Что записывается сейчас', enabled: active, click: () => this.actions.open('status') },
      { label: 'Расписание', click: () => this.actions.open('schedule') },
      { label: 'Записи', click: () => this.actions.open('recordings') },
      { label: 'Остановить запись', enabled: active, click: () => this.actions.stop() },
      { type: 'separator' },
      { label: 'Выйти', click: () => this.actions.quit() },
    ]));
  }
}
