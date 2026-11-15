import { powerSaveBlocker } from 'electron';
import type { RecorderStatus } from '@shared/types';
import { logInfo } from '../log';
import type { Notifier } from '../notifier';
import type { Recorder } from './recorder';

function describe(status: RecorderStatus): string {
  const lesson = status.lesson ? ` «${status.lesson.subject}» ${status.lesson.date} ${status.lesson.startTime}` : '';
  return `${status.state}${lesson}${status.message ? ` — ${status.message}` : ''}`;
}

/**
 * What the app does around a recording besides recording it: the journal, keeping
 * the computer awake, and telling the user what happened to a lesson.
 * `onFile` is called whenever a new file starts or the current one is closed.
 */
export function reactToRecorder(recorder: Recorder, notifier: Notifier, onFile: () => void): void {
  let logged = '';
  let blocker: number | null = null;
  let file: string | null = null;
  let announced: string | null = null;

  recorder.onStatus((status) => {
    const line = describe(status);
    if (line !== logged) logInfo(`Recorder: ${line}`);
    logged = line;

    // Keep the computer awake while a lesson is joined or recorded.
    const active = status.state !== 'idle';
    if (active && blocker === null) blocker = powerSaveBlocker.start('prevent-app-suspension');
    if (!active && blocker !== null) {
      powerSaveBlocker.stop(blocker);
      blocker = null;
    }

    if (status.file === file) return;
    // A reconnect starts a new part of the same lesson: one notice per lesson is enough.
    if (status.file && status.lesson && status.lesson.id !== announced) {
      announced = status.lesson.id;
      notifier.show('Запись началась', status.lesson.subject, { page: 'status', silent: true });
    }
    file = status.file;
    onFile();
  });

  recorder.onFinished(({ lesson, file: saved, message }) => {
    announced = null;
    logInfo(`Finished «${lesson.subject}»: ${saved ?? `not recorded (${message ?? 'no reason'})`}`);
    if (saved) notifier.show('Запись сохранена', lesson.subject, { page: 'recordings' });
    else notifier.show('Пара не записана', `${lesson.subject}${message ? ` — ${message}` : ''}`, { page: 'status' });
  });
}
