import { JOIN_LEAD, type Lesson } from '@shared/types';

/** Join this early: rooms often open before the bell. */
export const LEAD = JOIN_LEAD;
/** Keep recording after the bell unless the room ends or the next lesson needs us. */
export const GRACE = 15 * 60_000;

export interface PlanInput {
  lessons: readonly Lesson[];
  now: number;
  disabled: ReadonlySet<string>;
  /** Lessons already recorded, stopped by the user or given up on. */
  skip: ReadonlySet<string>;
}

function inWindow(lesson: Lesson, now: number): boolean {
  return lesson.startsAt - LEAD <= now && now < lesson.endsAt;
}

function wanted(lesson: Lesson, input: PlanInput): boolean {
  return !input.disabled.has(lesson.subjectKey) && !input.skip.has(lesson.id);
}

/** The lesson to record right now: the latest started one wins when two overlap. */
export function lessonToRecord(input: PlanInput): Lesson | null {
  let pick: Lesson | null = null;
  for (const lesson of input.lessons) {
    if (lesson.link && inWindow(lesson, input.now) && wanted(lesson, input)) pick = lesson;
  }
  return pick;
}

/** A wanted lesson is on now but its link is not published yet; worth re-fetching the schedule. */
export function awaitingLink(input: PlanInput): boolean {
  return input.lessons.some((lesson) => !lesson.link && inWindow(lesson, input.now) && wanted(lesson, input));
}

/** The next lesson that will be recorded, for the tray and the status card. */
export function nextToRecord(input: PlanInput): Lesson | null {
  return input.lessons.find((lesson) => lesson.startsAt - LEAD > input.now && wanted(lesson, input)) ?? null;
}

/** When the current session has to give way. */
export function stopAt(lesson: Lesson, lessons: readonly Lesson[]): number {
  const following = lessons.find((other) => other.startsAt >= lesson.endsAt && other.id !== lesson.id && other.link);
  const limit = lesson.endsAt + GRACE;
  return following ? Math.max(lesson.endsAt, Math.min(limit, following.startsAt - LEAD)) : limit;
}
