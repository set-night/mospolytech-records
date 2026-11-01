import type { AppInfo, Recording, RecorderStatus, ScheduleState, Settings, UpdateInfo } from './types';

/** Main-process handlers exposed to the UI; channel name = key. */
export interface Api {
  getInfo(): Promise<AppInfo>;
  getSettings(): Promise<Settings>;
  saveSettings(patch: Partial<Settings>): Promise<Settings>;
  chooseFolder(): Promise<string | null>;
  listGroups(): Promise<string[]>;
  checkGroup(group: string): Promise<string | null>;
  getSchedule(): Promise<ScheduleState>;
  refreshSchedule(): Promise<ScheduleState>;
  setSubjectEnabled(subjectKey: string, enabled: boolean): Promise<Settings>;
  getStatus(): Promise<RecorderStatus>;
  getPreview(): Promise<string | null>;
  stopRecording(): Promise<void>;
  recordNow(lessonId: string): Promise<void>;
  listRecordings(): Promise<Recording[]>;
  openFolder(): Promise<void>;
  showRecording(file: string): Promise<void>;
  openExternalPlayer(file: string): Promise<void>;
  trashRecording(file: string): Promise<void>;
  openRepo(): Promise<void>;
  checkUpdates(): Promise<UpdateInfo | null>;
}

export type ApiChannel = keyof Api;

export const API_CHANNELS: readonly ApiChannel[] = [
  'getInfo', 'getSettings', 'saveSettings', 'chooseFolder', 'listGroups', 'checkGroup', 'getSchedule',
  'refreshSchedule', 'setSubjectEnabled', 'getStatus', 'getPreview', 'stopRecording', 'recordNow',
  'listRecordings', 'openFolder', 'showRecording', 'openExternalPlayer', 'trashRecording', 'openRepo', 'checkUpdates',
];

/** Events pushed from main to the UI. */
export interface Events {
  status: RecorderStatus;
  schedule: ScheduleState;
  recordings: null;
  settings: Settings;
  update: UpdateInfo;
  navigate: string;
}

export type EventName = keyof Events;

export const EVENT_NAMES: readonly EventName[] = ['status', 'schedule', 'recordings', 'settings', 'update', 'navigate'];

export interface Bridge extends Api {
  on<E extends EventName>(event: E, listener: (payload: Events[E]) => void): () => void;
}

/** Media protocol serving files from the recordings folder to the player. */
export const MEDIA_SCHEME = 'media';

export function mediaUrl(file: string): string {
  return `${MEDIA_SCHEME}://recording/${encodeURIComponent(file)}`;
}
