import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import type { Schedule, ScheduleState } from '@shared/types';
import { fetchSchedule, ScheduleError, type ParsedSchedule } from './dmami';
import { buildLessons } from './timetable';

const HOUR = 60 * 60_000;
const SOON = 10 * 60_000;
const RETRY = 5 * 60_000;

const lessonSchema = z.object({
  id: z.string(),
  date: z.string(),
  slot: z.number(),
  startTime: z.string(),
  endTime: z.string(),
  startsAt: z.number(),
  endsAt: z.number(),
  subject: z.string(),
  subjectKey: z.string(),
  type: z.string(),
  teacher: z.string(),
  rooms: z.string(),
  link: z.string().nullable(),
});
const cacheSchema = z.object({
  group: z.string(),
  title: z.string(),
  fetchedAt: z.number(),
  lessons: z.array(lessonSchema),
});

/** The cached timetable, or `null` when there is none or it is from an incompatible version. */
function readCache(file: string): Schedule | null {
  try {
    return cacheSchema.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch {
    return null;
  }
}

/**
 * Keeps the group's timetable fresh and cached on disk, so recordings still
 * start when rasp.dmami.ru is down or the computer was offline at boot.
 */
export class ScheduleService {
  private schedule: Schedule | null;
  private loading = false;
  private error: string | null = null;
  /** The group `error` is about. */
  private attempted = '';
  private timer: NodeJS.Timeout | null = null;
  private stopped = false;
  private pending: Promise<ScheduleState> | null = null;
  private readonly listeners = new Set<(state: ScheduleState) => void>();

  constructor(
    private readonly cacheFile: string,
    private readonly group: () => string,
    private readonly fetch: (group: string) => Promise<ParsedSchedule> = fetchSchedule,
  ) {
    this.schedule = readCache(cacheFile);
  }

  state(): ScheduleState {
    const group = this.group();
    const schedule = this.schedule && this.schedule.group === group ? this.schedule : null;
    return { schedule, loading: this.loading, error: this.attempted === group ? this.error : null };
  }

  onChange(listener: (state: ScheduleState) => void): void {
    this.listeners.add(listener);
  }

  start(): void {
    this.stopped = false;
    void this.refresh();
  }

  /** No more background refreshes; used on quit. */
  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Loads the timetable of the current group; concurrent calls share one request. */
  refresh(): Promise<ScheduleState> {
    this.pending ??= this.load().finally(() => { this.pending = null; });
    return this.pending;
  }

  private async load(): Promise<ScheduleState> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    // The group may change while a request is in flight: go again for the new one.
    for (;;) {
      const group = this.group();
      // An error stays on screen while the same group is retried, not when another one is asked for.
      if (group !== this.attempted) this.error = null;
      this.attempted = group;
      if (!group) break;
      this.loading = true;
      this.emit();
      try {
        const parsed = await this.fetch(group);
        if (group !== this.group()) continue;
        this.schedule = { group, title: parsed.title, fetchedAt: Date.now(), lessons: buildLessons(parsed) };
        this.error = null;
        this.save(this.schedule);
      } catch (error) {
        if (group !== this.group()) continue;
        this.error = error instanceof ScheduleError ? error.message : 'Не удалось загрузить расписание';
      } finally {
        this.loading = false;
      }
      if (!this.stopped) this.timer = setTimeout(() => void this.refresh(), this.nextRefreshIn());
      break;
    }
    this.emit();
    return this.state();
  }

  /** The cache is a convenience: failing to write it must not hide a loaded timetable. */
  private save(schedule: Schedule): void {
    try {
      mkdirSync(dirname(this.cacheFile), { recursive: true });
      const temp = `${this.cacheFile}.tmp`;
      writeFileSync(temp, JSON.stringify(schedule));
      renameSync(temp, this.cacheFile);
    } catch {
      // Read-only or full disk: the timetable still works from memory.
    }
  }

  /** Hourly, but shortly before a lesson too: links are often published at the last minute. */
  private nextRefreshIn(): number {
    if (this.error) return RETRY;
    const now = Date.now();
    const next = this.schedule?.lessons.find((lesson) => lesson.startsAt - now > SOON);
    return next ? Math.max(60_000, Math.min(HOUR, next.startsAt - SOON - now)) : HOUR;
  }

  private emit(): void {
    const state = this.state();
    for (const listener of this.listeners) listener(state);
  }
}
