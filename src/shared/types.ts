export const REPO_URL = 'https://github.com/set-night/mospolytech-records';
export const APP_NAME = 'MosPolytech Records';

export type Quality = 'low' | 'medium' | 'high';

export interface Settings {
  group: string;
  folder: string;
  nickname: string;
  autoStart: boolean;
  quality: Quality;
  /** Subject keys (see `subjectKey`) the user switched recording off for. */
  disabledSubjects: string[];
  onboarded: boolean;
}

export interface Lesson {
  /** Stable for one lesson occurrence: date + slot + subject. */
  id: string;
  date: string;
  slot: number;
  /** Local Moscow time, `HH:MM`. */
  startTime: string;
  endTime: string;
  /** Absolute instants in milliseconds. */
  startsAt: number;
  endsAt: number;
  subject: string;
  subjectKey: string;
  type: string;
  teacher: string;
  rooms: string;
  link: string | null;
}

export interface Schedule {
  group: string;
  title: string;
  fetchedAt: number;
  /** All occurrences within the semester range, ordered by start. */
  lessons: Lesson[];
}

export interface ScheduleState {
  schedule: Schedule | null;
  loading: boolean;
  error: string | null;
}

export type RecordingStatus = 'recording' | 'done' | 'partial';

export interface RecordingMeta {
  lessonId: string;
  subject: string;
  type: string;
  teacher: string;
  date: string;
  startTime: string;
  endTime: string;
  link: string;
  startedAt: number;
  finishedAt: number | null;
  status: RecordingStatus;
  note: string | null;
}

export interface Recording extends RecordingMeta {
  file: string;
  name: string;
  size: number;
}

export type RecorderState = 'idle' | 'waiting' | 'joining' | 'recording';

export interface RecorderStatus {
  state: RecorderState;
  lesson: Lesson | null;
  /** Recording start, while `state === 'recording'`. */
  since: number | null;
  file: string | null;
  message: string | null;
  next: Lesson | null;
}

export interface UpdateInfo {
  current: string;
  latest: string;
  url: string;
}

export interface AppInfo {
  version: string;
  platform: string;
  repo: string;
  defaultFolder: string;
}
