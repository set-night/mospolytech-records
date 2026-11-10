import type { Lesson, RecorderStatus } from '@shared/types';
import type { ScheduleService } from '../schedule/service';
import type { SettingsStore } from '../settings/store';
import { awaitingLink, lessonToRecord, nextToRecord, stopAt, type PlanInput } from './plan';
import { RecordingSession } from './session';

const TICK = 30_000;
const LINK_RETRY = 3 * 60_000;

/** A session that ended on its own, not because the user or the app stopped it. */
export interface Finished {
  lesson: Lesson;
  /** Last part written, or `null` when the lesson never started. */
  file: string | null;
  message: string | null;
}

/** Decides what to record and runs one `RecordingSession` at a time. */
export class Recorder {
  private current: RecordingSession | null = null;
  private manual: string | null = null;
  private readonly skip = new Set<string>();
  private timer: NodeJS.Timeout | null = null;
  private linkCheckedAt = 0;
  /** Set on quit: nothing may start any more. */
  private closed = false;
  private lastMessage: string | null = null;
  private readonly listeners = new Set<(status: RecorderStatus) => void>();
  private readonly finishedListeners = new Set<(finished: Finished) => void>();
  /** Sessions stopped on request: no "finished" notice for them. */
  private readonly requested = new WeakSet<RecordingSession>();

  constructor(private readonly settings: SettingsStore, private readonly schedule: ScheduleService) {
    schedule.onChange(() => this.tick());
    settings.onChange(() => this.tick());
  }

  /** Starts planning; also called after the computer wakes up, to catch up at once. */
  start(): void {
    this.tick();
  }

  onStatus(listener: (status: RecorderStatus) => void): void {
    this.listeners.add(listener);
  }

  onFinished(listener: (finished: Finished) => void): void {
    this.finishedListeners.add(listener);
  }

  status(): RecorderStatus {
    const session = this.current;
    const next = nextToRecord(this.input());
    if (!session) return { state: 'idle', lesson: null, since: null, file: null, message: this.lastMessage, next };
    const state = session.phase === 'finished' ? 'idle' : session.phase;
    return { state, lesson: session.lesson, since: session.since, file: session.file, message: session.message, next };
  }

  preview(): Promise<string | null> {
    return this.current?.preview() ?? Promise.resolve(null);
  }

  /** Opens the lesson being recorded in its own window. */
  watch(): void {
    if (!this.current) throw new Error('Сейчас ничего не записывается');
    this.current.watch();
  }

  sendChat(text: string): Promise<void> {
    if (!this.current) return Promise.reject(new Error('Сейчас ничего не записывается'));
    return this.current.sendChat(text);
  }

  /** The user pressed stop: do not restart this lesson. */
  async stopCurrent(): Promise<void> {
    const session = this.current;
    if (!session) return;
    this.skip.add(session.lesson.id);
    this.requested.add(session);
    await session.stop('Остановлено вручную');
  }

  /** Records a lesson that is on now even if its subject is switched off. */
  async recordNow(lessonId: string): Promise<void> {
    const lesson = this.lessons().find((item) => item.id === lessonId);
    if (!lesson?.link) throw new Error('У этой пары нет ссылки на вебинар');
    if (lesson.endsAt <= Date.now()) throw new Error('Пара уже закончилась');
    this.skip.delete(lesson.id);
    this.manual = lesson.id;
    if (this.current && this.current.lesson.id !== lesson.id) {
      this.requested.add(this.current);
      await this.current.stop('Переключаюсь на другую пару');
    }
    this.tick();
  }

  /** Waits for files to be closed; used on quit. */
  async shutdown(): Promise<void> {
    this.closed = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    if (this.current) this.requested.add(this.current);
    await this.current?.stop('Приложение закрыто', 'partial');
  }

  private lessons(): Lesson[] {
    return this.schedule.state().schedule?.lessons ?? [];
  }

  private input(): PlanInput {
    return {
      lessons: this.lessons(),
      now: Date.now(),
      disabled: new Set(this.settings.get().disabledSubjects),
      skip: this.skip,
    };
  }

  private tick(): void {
    if (this.closed) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.tick(), TICK);
    const input = this.input();
    const settings = this.settings.get();

    if (this.current) {
      const lesson = this.current.lesson;
      const replacement = lessonToRecord(input);
      // A new lesson started and this one is past its bell: hand over.
      if (replacement && replacement.id !== lesson.id && lesson.endsAt <= input.now && this.manual !== lesson.id) {
        void this.current.stop('Началась следующая пара');
      }
      this.emit();
      return;
    }
    if (!settings.onboarded || !settings.group) return this.emit();

    const manual = this.manual ? input.lessons.find((lesson) => lesson.id === this.manual && lesson.endsAt > input.now) : undefined;
    const lesson = manual ?? lessonToRecord(input);
    if (!manual) this.manual = null;
    if (lesson?.link) {
      this.begin(lesson, lesson.link, input);
    } else if (awaitingLink(input) && input.now - this.linkCheckedAt > LINK_RETRY) {
      this.linkCheckedAt = input.now;
      void this.schedule.refresh();
    }
    this.emit();
  }

  private begin(lesson: Lesson, link: string, input: PlanInput): void {
    const settings = this.settings.get();
    const session = new RecordingSession({
      lesson,
      link,
      folder: settings.folder,
      nickname: settings.nickname,
      quality: settings.quality,
      stopAt: stopAt(lesson, input),
    });
    this.current = session;
    session.onUpdate(() => this.emit());
    void session.done.then(() => {
      // Finished on its own (ended, time, error): do not rejoin this lesson.
      this.skip.add(lesson.id);
      if (this.manual === lesson.id) this.manual = null;
      this.lastMessage = session.file ? `Запись «${lesson.subject}» сохранена` : session.message;
      this.current = null;
      if (!this.requested.has(session)) {
        for (const listener of this.finishedListeners) listener({ lesson, file: session.file, message: session.message });
      }
      this.tick();
    });
    session.start();
  }

  private emit(): void {
    const status = this.status();
    for (const listener of this.listeners) listener(status);
  }
}
