import { BrowserWindow, shell, type WebContents } from 'electron';
import type { EventName, Events } from '@shared/api';
import { APP_NAME } from '@shared/types';
import { logError } from './log';
import { loadPage, preloadPath } from './pages';
import { iconPath } from './tray';

/** A renderer that dies twice within this time is not reloaded again: it would only loop. */
const RELOAD_GAP = 30_000;

/** The one application window. Closing it hides it: recordings go on in the tray. */
export class MainWindow {
  private window: BrowserWindow | null = null;
  private closable = false;
  private reloadedAt = 0;

  /** The window itself, for dialogs that belong to it. */
  get native(): BrowserWindow | null {
    return this.window && !this.window.isDestroyed() ? this.window : null;
  }

  /** Whether the user can see the window right now. */
  get visible(): boolean {
    const window = this.native;
    return !!window && window.isVisible() && !window.isMinimized();
  }

  /** Only our own UI may talk to main; the webinar and capture windows have their own channels. */
  owns(contents: WebContents): boolean {
    return contents === this.native?.webContents;
  }

  /** Shows the window, creating it if needed, on `page` if one is given. */
  open(page?: string): void {
    const window = this.native;
    if (!window) {
      this.create(page);
      return;
    }
    if (page) this.send('navigate', page);
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  }

  send<E extends EventName>(event: E, payload: Events[E]): void {
    this.native?.webContents.send(`event:${event}`, payload);
  }

  /** From now on closing the window really closes it; used on quit. */
  release(): void {
    this.closable = true;
  }

  private create(page?: string): void {
    const window = new BrowserWindow({
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
    this.window = window;
    window.once('ready-to-show', () => window.show());
    window.on('close', (event) => {
      if (this.closable) return;
      event.preventDefault();
      window.hide();
    });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (url.startsWith('https://')) void shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    // A crashed renderer leaves a blank window forever; the recorder lives in main and is not affected.
    window.webContents.on('render-process-gone', (_event, details) => {
      if (details.reason === 'clean-exit' || this.closable) return;
      logError(`The window process is gone: ${details.reason} (exit code ${details.exitCode})`);
      const now = Date.now();
      if (now - this.reloadedAt < RELOAD_GAP) return;
      this.reloadedAt = now;
      void loadPage(window, 'index').catch((error: unknown) => logError('Could not reload the window', error));
    });
    void loadPage(window, 'index', page);
  }
}
