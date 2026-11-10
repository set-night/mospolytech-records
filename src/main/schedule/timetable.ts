import { createHash } from 'node:crypto';
import { subjectKey } from '@shared/subject';
import type { Lesson } from '@shared/types';
import type { ParsedSchedule } from './dmami';

type Slot = readonly [start: string, end: string];

const DAY: readonly Slot[] = [
  ['09:00', '10:30'], ['10:40', '12:10'], ['12:20', '13:50'], ['14:30', '16:00'],
  ['16:10', '17:40'], ['17:50', '19:20'], ['19:30', '21:00'],
];

/** Time grids from rasp.dmami.ru; evening groups differ only in the last two slots. */
const GRIDS: Record<number, readonly Slot[]> = {
  0: DAY,
  1: [...DAY.slice(0, 5), ['18:20', '19:40'], ['19:50', '21:10']],
  2: [...DAY.slice(0, 5), ['18:30', '20:00'], ['20:10', '21:40']],
};

export function slotTime(evening: number, slot: number): Slot | null {
  return (GRIDS[evening] ?? DAY)[slot - 1] ?? null;
}

/** The university runs on Moscow time (UTC+3, no daylight saving). */
export function moscowInstant(date: string, time: string): number {
  return Date.parse(`${date}T${time}:00+03:00`);
}

/** ISO weekday, Monday = 1, of a calendar date. */
export function weekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 ? 7 : day;
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function lessonId(date: string, slot: number, key: string, type: string): string {
  return createHash('sha1').update(JSON.stringify([date, slot, key, type])).digest('hex').slice(0, 16);
}

/** Expands weekday rules and dated cells into concrete lessons ordered by start. */
export function buildLessons(schedule: ParsedSchedule): Lesson[] {
  const lessons = new Map<string, Lesson>();
  const add = (date: string, entry: ParsedSchedule['entries'][number]): void => {
    const time = slotTime(schedule.evening, entry.slot);
    if (!time) return;
    const key = subjectKey(entry.subject);
    const id = lessonId(date, entry.slot, key, entry.type);
    // The same lesson listed twice (subgroups, a dated copy): keep the one that can be recorded.
    const known = lessons.get(id);
    if (known && (known.link || !entry.link)) return;
    lessons.set(id, {
      id, date, slot: entry.slot, startTime: time[0], endTime: time[1],
      startsAt: moscowInstant(date, time[0]), endsAt: moscowInstant(date, time[1]),
      subject: entry.subject, subjectKey: key, type: entry.type, teacher: entry.teacher, rooms: entry.rooms, link: entry.link,
    });
  };
  for (const entry of schedule.entries) {
    if (entry.date) {
      add(entry.date, entry);
      continue;
    }
    if (entry.weekday === null) continue;
    const from = schedule.dateFrom && schedule.dateFrom > entry.from ? schedule.dateFrom : entry.from;
    const to = schedule.dateTo && schedule.dateTo < entry.to ? schedule.dateTo : entry.to;
    let date = from;
    // Step to the entry's weekday, then by whole weeks.
    for (let shift = 0; shift < 7 && weekday(date) !== entry.weekday; shift++) date = addDays(date, 1);
    for (; date <= to; date = addDays(date, 7)) add(date, entry);
  }
  return [...lessons.values()].sort((a, b) => a.startsAt - b.startsAt || a.subject.localeCompare(b.subject, 'ru'));
}
