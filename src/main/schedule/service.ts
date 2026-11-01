import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Schedule, ScheduleState } from '@shared/types';
import { fetchSchedule, ScheduleError } from './dmami';
import { buildLessons } from './timetable';

const HOUR = 60 * 60_000;
const SOON = 10 * 60_000;

/**
 * Keeps the group's timetable fresh and cached on disk, so recordings still
 * start when rasp.dmami.ru is down or the computer was offline at boot.
 */
export class ScheduleService {
  private schedule: Schedule | null = null;
  private loading = false;
  private error: string | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pending: Promise<ScheduleState> | null = null;
  private readonly listeners = new Set<(state: ScheduleState) => void>();

  constructor(private readonly cacheFile: string, private readonly group: () => string) {
    try {
      const cached = JSON.parse(readFileSync(cacheFile, 'utf8')) as Schedule;
      if (Array.isArray(cached.lessons) && typeof cached.group === 'string') this.schedule = cached;
    } catch {
      // No cache yet.
    }
  }

  state(): ScheduleState {
    const group = this.group();
    const schedule = this.schedule && this.schedule.group === group ? this.schedule : null;
    return { schedule, loading: this.loading, error: this.error };
  }

  onChange(listener: (state: ScheduleState) => void): void {
    this.listeners.add(listener);
  }

  start(): void {
    void this.refresh();
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  refresh(): Promise<ScheduleState> {
    this.pending ??= this.load().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async load(): Promise<ScheduleState> {
    const group = this.group();
    if (this.timer) clearTimeout(this.timer);
    if (!group) {
      this.error = null;
      this.emit();
      return this.state();
    }
    this.loading = true;
    this.emit();
    try {
      const parsed = await fetchSchedule(group);
      // The group may have changed while the request was in flight.
      if (group === this.group()) {
        this.schedule = { group, title: parsed.title, fetchedAt: Date.now(), lessons: buildLessons(parsed) };
        this.error = null;
        mkdirSync(dirname(this.cacheFile), { recursive: true });
        writeFileSync(this.cacheFile, JSON.stringify(this.schedule));
      }
    } catch (error) {
      this.error = error instanceof ScheduleError ? error.message : 'Не удалось загрузить расписание';
    } finally {
      this.loading = false;
    }
    this.timer = setTimeout(() => void this.refresh(), this.nextRefreshIn());
    this.emit();
    return this.state();
  }

  /** Hourly, but shortly before a lesson too: links are often published at the last minute. */
  private nextRefreshIn(): number {
    if (this.error) return 5 * 60_000;
    const now = Date.now();
    const next = this.state().schedule?.lessons.find((lesson) => lesson.startsAt - now > SOON);
    return next ? Math.max(60_000, Math.min(HOUR, next.startsAt - SOON - now)) : HOUR;
  }

  private emit(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}
