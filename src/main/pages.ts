import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { BrowserWindow } from 'electron';

const here = fileURLToPath(new URL('.', import.meta.url));

export function preloadPath(name: 'index' | 'capture' | 'live'): string {
  return join(here, '../preload', `${name}.cjs`);
}

/** Loads a renderer page: the Vite dev server in development, the built file otherwise. */
export function loadPage(window: BrowserWindow, page: 'index' | 'capture' | 'live', hash = ''): Promise<void> {
  const dev = process.env.ELECTRON_RENDERER_URL;
  if (dev) return window.loadURL(`${dev}/${page}.html${hash ? `#${hash}` : ''}`);
  return window.loadFile(join(here, '../renderer', `${page}.html`), hash ? { hash } : undefined);
}
