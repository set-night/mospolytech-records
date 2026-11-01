import { contextBridge, ipcRenderer } from 'electron';
import { API_CHANNELS, EVENT_NAMES, type Api, type Bridge, type EventName, type Events } from '@shared/api';

const api = Object.fromEntries(
  API_CHANNELS.map((channel) => [channel, (...args: unknown[]) => ipcRenderer.invoke(channel, ...args)]),
) as unknown as Api;

const bridge: Bridge = {
  ...api,
  on<E extends EventName>(event: E, listener: (payload: Events[E]) => void) {
    if (!EVENT_NAMES.includes(event)) throw new Error(`Unknown event ${event}`);
    const handler = (_event: Electron.IpcRendererEvent, payload: Events[E]): void => listener(payload);
    ipcRenderer.on(`event:${event}`, handler);
    return () => { ipcRenderer.removeListener(`event:${event}`, handler); };
  },
};

contextBridge.exposeInMainWorld('api', bridge);
