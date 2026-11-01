export const REPO_URL = 'https://github.com/set-night/mospolytech-records';
export const APP_NAME = 'MosPolytech Records';

/** Rooms often open before the bell, so the recorder joins this early. */
export const JOIN_LEAD = 5 * 60_000;

export type Quality = 'low' | 'medium' | 'high';

/** Roughly what one 90-minute lesson takes on disk at each quality. */
export const LESSON_BYTES: Record<Quality, number> = {
  low: 0.6 * 1024 ** 3,
  medium: 1.1 * 1024 ** 3,
  high: 2.1 * 1024 ** 3,
};

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

/**
 * `manual`: the user downloads the installer from the release page (macOS, msi, deb).
 * `downloading` / `ready`: the app fetches the update itself and installs it on restart.
 */
export type UpdateStage = 'manual' | 'downloading' | 'ready';

export interface UpdateInfo {
  current: string;
  latest: string;
  url: string;
  stage: UpdateStage;
  /** Download progress, 0–100, while `downloading`. */
  percent: number | null;
}

export interface DiskSpace {
  free: number | null;
  /** How many lessons fit at the current quality. */
  lessons: number | null;
}

export interface AppInfo {
  version: string;
  platform: string;
  repo: string;
  defaultFolder: string;
}
