import type { RecorderState, UpdateMode, UpdateStage } from '@shared/types';
import { isNewer, type InstallKind } from './release';

/** What the process knows about how it was installed. */
export interface Runtime {
  packaged: boolean;
  platform: NodeJS.Platform;
  /** Started from an AppImage (`APPIMAGE` is set). */
  appImage: boolean;
  /** The uninstaller the .exe installer leaves next to the program; the .msi has none. */
  uninstaller: boolean;
}

export function installKind(runtime: Runtime): InstallKind {
  if (!runtime.packaged) return 'dev';
  switch (runtime.platform) {
    case 'win32': return runtime.uninstaller ? 'nsis' : 'msi';
    case 'darwin': return 'dmg';
    case 'linux': return runtime.appImage ? 'appimage' : 'deb';
    default: return 'dev';
  }
}

/**
 * Only these builds can replace themselves without asking for an administrator password.
 * macOS would need a Developer ID signature, which the builds do not have.
 */
export function selfUpdating(kind: InstallKind): boolean {
  return kind === 'nsis' || kind === 'appimage';
}

/** A lesson this close is not worth the risk of a restart that goes wrong. */
export const QUIET_BEFORE_LESSON = 30 * 60_000;

export interface Moment {
  mode: UpdateMode;
  stage: UpdateStage;
  recorder: RecorderState;
  /** Start of the next lesson to record, in milliseconds. */
  nextLessonAt: number | null;
  windowVisible: boolean;
  now: number;
}

/**
 * Whether the app may restart into the downloaded update on its own, right now:
 * only when the user allowed it, is not looking at the window, and no lesson is on or near.
 */
export function canInstallNow(moment: Moment): boolean {
  if (moment.mode !== 'auto' || moment.stage !== 'ready') return false;
  if (moment.recorder !== 'idle' || moment.windowVisible) return false;
  return moment.nextLessonAt === null || moment.nextLessonAt - moment.now > QUIET_BEFORE_LESSON;
}

/**
 * Whether to tell what is new in `current`: after an update, but not after the first
 * install and not after going back to an older version.
 * `seen` is empty for a fresh install and for versions that did not keep track yet.
 */
export function shouldShowWhatsNew(seen: string, current: string, onboarded: boolean): boolean {
  if (seen === current) return false;
  return seen === '' ? onboarded : isNewer(current, seen);
}
