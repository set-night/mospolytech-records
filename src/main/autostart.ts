import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { app } from 'electron';

export const HIDDEN_ARG = '--hidden';

/**
 * A program path as the `Exec` key of a desktop entry wants it: quoted, with the
 * shell-like characters escaped, then with backslashes doubled as in any string value.
 */
export function desktopExec(path: string): string {
  const quoted = `"${path.replace(/["`$\\]/g, '\\$&')}"`;
  return quoted.replace(/\\/g, '\\\\').replace(/%/g, '%%');
}

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
      `Exec=${desktopExec(exec)} ${HIDDEN_ARG}`, 'X-GNOME-Autostart-enabled=true', 'Terminal=false', '',
    ].join('\n'));
    return;
  }
  app.setLoginItemSettings({ openAtLogin: enabled, args: [HIDDEN_ARG] });
}

/** A restart into an update counts as hidden only for a while: a stale mark must not hide the window. */
const HIDDEN_MARK_TTL = 10 * 60_000;

/**
 * The installer starts the app again without our arguments: a file tells the next start
 * to stay in the tray, as before the quiet update.
 */
export function leaveHiddenMark(file: string, now = Date.now()): void {
  writeFileSync(file, String(now));
}

/** Whether the mark is there and fresh; it is removed either way. */
export function takeHiddenMark(file: string, now = Date.now()): boolean {
  let left: number;
  try {
    left = Number(readFileSync(file, 'utf8'));
  } catch {
    return false;
  }
  rmSync(file, { force: true });
  return Number.isFinite(left) && now - left >= 0 && now - left < HIDDEN_MARK_TTL;
}

export function startedHidden(): boolean {
  if (process.argv.includes(HIDDEN_ARG)) return true;
  return process.platform === 'darwin' && app.getLoginItemSettings().wasOpenedAtLogin === true;
}
