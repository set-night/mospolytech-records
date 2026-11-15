import type { Settings, UpdateState } from '@shared/types';
import { logInfo } from '../log';
import type { Notifier } from '../notifier';
import type { Recorder } from '../recorder/recorder';
import type { AppTray } from '../tray';
import type { MainWindow } from '../window';
import { canInstallNow } from './policy';
import type { Updater } from './updater';

/** How often a downloaded update looks for a quiet moment to install itself. */
const CONSIDER_EVERY = 5 * 60_000;

export interface UpdateParts {
  updater: Updater;
  recorder: Recorder;
  notifier: Notifier;
  window: MainWindow;
  tray: AppTray;
  settings: () => Settings;
  /** Remembers which version the user was already told about. */
  announce: (version: string) => void;
  /** Restarts into the downloaded update, back to the tray. */
  installQuietly: () => void;
}

/**
 * What the app does around updates: the journal, the tray, notices once per version,
 * and installing a downloaded update in a moment nobody will notice.
 */
export function reactToUpdates(parts: UpdateParts): void {
  const { updater, recorder, notifier, window, tray, settings } = parts;
  let logged = '';
  let toldReady: string | null = null;

  function consider(): void {
    const state = updater.state();
    const status = recorder.status();
    const now = Date.now();
    if (!canInstallNow({
      mode: settings().updates,
      stage: state.stage,
      recorder: status.state,
      nextLessonAt: status.next?.startsAt ?? null,
      windowVisible: window.visible,
      now,
    })) return;
    logInfo(`Update ${state.latest}: installing while the app is idle`);
    parts.installQuietly();
  }

  function tell(state: UpdateState): void {
    const version = state.latest;
    if (!version) return;
    const mode = settings().updates;
    const fresh = settings().announcedVersion !== version;
    if (fresh && (state.stage === 'manual' || (state.stage === 'available' && mode === 'notify'))) {
      parts.announce(version);
      notifier.show(
        `Вышла версия ${version}`,
        state.selfUpdating ? 'Открой «О программе», чтобы обновиться.' : 'Нажми, чтобы скачать установщик.',
        { page: 'about', always: true },
      );
    }
    if (state.stage === 'ready' && mode !== 'auto' && toldReady !== version) {
      toldReady = version;
      notifier.show(`Версия ${version} скачана`, 'Перезапусти приложение, когда будет удобно.', { page: 'about', always: true });
    }
  }

  updater.onChange((state) => {
    const line = `${state.stage}${state.latest ? ` ${state.latest}` : ''}${state.error ? ` — ${state.error}` : ''}`;
    if (line !== logged) logInfo(`Update: ${line}`);
    logged = line;
    window.send('update', state);
    tray.offer(state.latest && (state.stage === 'ready' || state.stage === 'manual' || state.stage === 'available')
      ? { version: state.latest, ready: state.stage === 'ready' }
      : null);
    tell(state);
    consider();
  });

  let busy = false;
  recorder.onStatus((status) => {
    const active = status.state !== 'idle';
    // A lesson has ended: the download put off for it can go now.
    if (busy && !active) updater.resume();
    busy = active;
  });

  setInterval(consider, CONSIDER_EVERY);
}
