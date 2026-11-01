import { JOIN_LEAD, type Lesson, type Settings } from '@shared/types';

export type LessonState = 'live' | 'record' | 'off' | 'nolink' | 'past';

export function lessonState(lesson: Lesson, settings: Settings, now: number): LessonState {
  if (lesson.endsAt <= now) return 'past';
  if (!lesson.link) return 'nolink';
  if (settings.disabledSubjects.includes(lesson.subjectKey)) return 'off';
  return lesson.startsAt - JOIN_LEAD <= now ? 'live' : 'record';
}

/** "Record now" is offered while the lesson's join window is open. */
export function canRecordNow(lesson: Lesson, now: number): boolean {
  return Boolean(lesson.link) && lesson.startsAt - JOIN_LEAD <= now && now < lesson.endsAt;
}

export interface Subject {
  key: string;
  name: string;
  types: string[];
  online: boolean;
}

/** Distinct subjects of the schedule, alphabetically. */
export function subjects(lessons: readonly Lesson[]): Subject[] {
  const map = new Map<string, Subject>();
  for (const lesson of lessons) {
    const subject = map.get(lesson.subjectKey) ?? { key: lesson.subjectKey, name: lesson.subject, types: [], online: false };
    if (lesson.type && !subject.types.includes(lesson.type)) subject.types.push(lesson.type);
    subject.online ||= Boolean(lesson.link);
    map.set(lesson.subjectKey, subject);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}
