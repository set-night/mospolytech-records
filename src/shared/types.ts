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
  /** System notifications about recordings; a low disk and a new version to install by hand are shown regardless. */
  notifications: boolean;
  /** Our own recordings older than this many days go to the trash; 0 keeps them forever. */
  keepDays: number;
  updates: UpdateMode;
  /** The version whose "what's new" the user has already seen; empty on a fresh install. */
  seenVersion: string;
  /** The newest version a "new version is out" notification was shown for: one notice per version. */
  announcedVersion: string;
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
 * How much the app does about a new version by itself.
 * `auto`: downloads it and restarts into it when nobody is looking and no lesson is near.
 * `ask`: downloads it and waits for the user to press "restart".
 * `notify`: only tells that it is out.
 */
export type UpdateMode = 'auto' | 'ask' | 'notify';

/**
 * `idle`: nothing newer is known. `checking`: asking GitHub right now.
 * `available`: a newer version the app can fetch itself; `downloading` and `ready` follow.
 * `manual`: a newer version the user installs by hand (macOS, msi, deb): `url` is the installer.
 * `error`: the check failed and no newer version is known.
 */
export type UpdateStage = 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'manual' | 'error';

/** A heading of the release notes with its entries, e.g. «Исправления». */
export interface ReleaseSection {
  title: string;
  items: string[];
}

export interface UpdateState {
  current: string;
  /** The newer version, once one is known. */
  latest: string | null;
  stage: UpdateStage;
  /** Download progress, 0–100, while `downloading`. */
  percent: number | null;
  /** What is new in `latest`. */
  notes: ReleaseSection[];
  /** The installer of `latest` for this build, or the release page. */
  url: string;
  /** When GitHub last answered, in milliseconds. */
  checkedAt: number | null;
  /** Why the last check or download failed, in words for the user. */
  error: string | null;
  /** Whether this build can replace itself: the Windows .exe installer and the AppImage can. */
  selfUpdating: boolean;
  /** What is new in `current`, right after an update; `null` once the user has seen it. */
  whatsNew: ReleaseSection[] | null;
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
