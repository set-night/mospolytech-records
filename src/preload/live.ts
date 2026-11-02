import { contextBridge, ipcRenderer } from 'electron';
import { LIVE_CHANNELS, type LiveBridge } from '@shared/live';

const bridge: LiveBridge = {
  sendChat: async (text) => {
    await ipcRenderer.invoke(LIVE_CHANNELS.chat, text);
  },
  fullscreen: (on) => ipcRenderer.send(LIVE_CHANNELS.fullscreen, on),
};

contextBridge.exposeInMainWorld('live', bridge);
