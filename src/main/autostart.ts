import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';

export const HIDDEN_ARG = '--hidden';

function linuxEntry(): string {
  return join(process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'), 'autostart', 'mospolytech-records.desktop');
}

/** Starts the app (to the tray) at login. Development builds never register themselves. */
export function applyAutoStart(enabled: boolean): void {
  if (!app.isPackaged) return;
  if (process.platform === 'linux') {
    const file = linuxEntry();
    if (!enabled) {
      rmSync(file, { force: true });
      return;
    }
    // AppImages move with the file; APPIMAGE points at the current location.
    const exec = process.env.APPIMAGE ?? process.execPath;
    mkdirSync(join(file, '..'), { recursive: true });
    writeFileSync(file, [
      '[Desktop Entry]', 'Type=Application', 'Name=MosPolytech Records',
      `Exec="${exec.replace(/"/g, '\\"')}" ${HIDDEN_ARG}`, 'X-GNOME-Autostart-enabled=true', 'Terminal=false', '',
    ].join('\n'));
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
}

export function startedHidden(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true;
}
