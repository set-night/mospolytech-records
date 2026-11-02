import { app, dialog, ipcMain, shell, type BrowserWindow } from 'electron';
import { z } from 'zod';
import type { Api, ApiChannel, EventName, Events } from '@shared/api';
import { API_CHANNELS } from '@shared/api';
import { chatText } from '@shared/live';
import { LESSON_BYTES, REPO_URL } from '@shared/types';
import type { Recorder } from './recorder/recorder';
import { freeSpace } from './recordings/disk';
import { insideFolder, listRecordings, trashRecording } from './recordings/library';
import { fetchGroups, fetchSchedule, normalizeGroup, ScheduleError } from './schedule/dmami';
import type { ScheduleService } from './schedule/service';
import type { SettingsStore } from './settings/store';
import { defaultFolder } from './settings/store';
import type { Updater } from './updates';

export interface Context {
  settings: SettingsStore;
  schedule: ScheduleService;
  recorder: Recorder;
  updater: Updater;
  window: () => BrowserWindow | null;
  logFile: string;
  /** Quits the app, installing a downloaded update and starting again if asked. */
  quit: (restart: boolean) => Promise<void>;
}

type Handlers = { [K in ApiChannel]: (args: unknown[]) => ReturnType<Api[K]> | Awaited<ReturnType<Api[K]>> };

const text = z.string().min(1).max(1000);
const groupSchema = z.string().trim().min(1).max(40);

/** Only an absolute file directly inside the recordings folder may cross the boundary. */
function recordingFile(context: Context, value: unknown): string {
  const path = insideFolder(context.settings.get().folder, text.parse(value));
  if (!path) throw new Error('Файл не из папки с записями');
  return path;
}

let groups: Promise<string[]> | null = null;

function handlers(context: Context): Handlers {
  const { settings, schedule, recorder, updater } = context;
  return {
    getInfo: () => ({ version: app.getVersion(), platform: process.platform, repo: REPO_URL, defaultFolder: defaultFolder(app.getPath('documents')) }),
    getSettings: () => settings.get(),
    saveSettings: ([patch]) => settings.update(patch),
    chooseFolder: async () => {
      const window = context.window();
      const options = { properties: ['openDirectory', 'createDirectory'] as Array<'openDirectory' | 'createDirectory'>, defaultPath: settings.get().folder };
      const result = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
      return result.canceled ? null : (result.filePaths[0] ?? null);
    },
    listGroups: () => {
      groups ??= fetchGroups().catch((error: unknown) => {
        groups = null;
        throw error;
      });
      return groups;
    },
    checkGroup: async ([value]) => {
      const group = normalizeGroup(groupSchema.parse(value));
      try {
        await fetchSchedule(group);
        return group;
      } catch (error) {
        if (error instanceof ScheduleError) return null;
        throw error;
      }
    },
    getSchedule: () => schedule.state(),
    refreshSchedule: () => schedule.refresh(),
    setSubjectEnabled: ([key, enabled]) => {
      const subject = z.string().min(1).max(300).parse(key);
      const on = z.boolean().parse(enabled);
      const disabled = new Set(settings.get().disabledSubjects);
      if (on) disabled.delete(subject);
      else disabled.add(subject);
      return settings.update({ disabledSubjects: [...disabled] });
    },
    getStatus: () => recorder.status(),
    getPreview: () => recorder.preview(),
    stopRecording: () => recorder.stopCurrent(),
    recordNow: ([id]) => recorder.recordNow(text.parse(id)),
    watchLesson: () => recorder.watch(),
    sendChat: ([message]) => recorder.sendChat(chatText(message)),
    listRecordings: () => listRecordings(settings.get().folder, recorder.status().file),
    openFolder: async () => {
      const error = await shell.openPath(settings.get().folder);
      if (error) throw new Error(error);
    },
    getDiskSpace: async () => {
      const { folder, quality } = settings.get();
      const free = await freeSpace(folder);
      return { free, lessons: free === null ? null : Math.floor(free / LESSON_BYTES[quality]) };
    },
    showRecording: ([file]) => shell.showItemInFolder(recordingFile(context, file)),
    openExternalPlayer: async ([file]) => {
      const error = await shell.openPath(recordingFile(context, file));
      if (error) throw new Error(error);
    },
    trashRecording: async ([file]) => {
      const path = recordingFile(context, file);
      if (path === recorder.status().file) throw new Error('Эта запись ещё идёт');
      await trashRecording(settings.get().folder, path, (target) => shell.trashItem(target));
    },
    openRepo: () => shell.openExternal(REPO_URL),
    showLog: () => shell.showItemInFolder(context.logFile),
    checkUpdates: () => updater.check().catch(() => updater.state()),
    installUpdate: async () => {
      if (recorder.status().state !== 'idle') throw new Error('Сейчас идёт пара — обновлю после неё');
      if (!updater.ready) throw new Error('Обновление ещё не скачано');
      await context.quit(true);
    },
  };
}

export function registerIpc(context: Context): void {
  const table = handlers(context);
  for (const channel of API_CHANNELS) {
    ipcMain.handle(channel, (event, ...args: unknown[]) => {
      // Only our own UI talks to main; the webinar and capture windows have their own channels.
      if (event.sender !== context.window()?.webContents) throw new Error('Forbidden');
      return table[channel](args);
    });
  }
}

export function send<E extends EventName>(context: Context, event: E, payload: Events[E]): void {
  const window = context.window();
  if (window && !window.isDestroyed()) window.webContents.send(`event:${event}`, payload);
}
