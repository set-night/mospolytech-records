import { contextBridge, ipcRenderer } from 'electron';
import { CAPTURE_CHANNELS, type CaptureBridge, type CaptureOptions } from '@shared/capture';

const bridge: CaptureBridge = {
  onStart: (listener) => { ipcRenderer.on(CAPTURE_CHANNELS.start, (_event, options: CaptureOptions) => listener(options)); },
  onStop: (listener) => { ipcRenderer.on(CAPTURE_CHANNELS.stop, () => listener()); },
  started: (mimeType) => ipcRenderer.send(CAPTURE_CHANNELS.started, mimeType),
  chunk: (data) => ipcRenderer.send(CAPTURE_CHANNELS.chunk, data),
  stopped: () => ipcRenderer.send(CAPTURE_CHANNELS.stopped),
  error: (message) => ipcRenderer.send(CAPTURE_CHANNELS.error, message),
};

contextBridge.exposeInMainWorld('capture', bridge);
