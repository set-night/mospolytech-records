/** IPC between the main process and the hidden capture page. */
export const CAPTURE_CHANNELS = {
  start: 'capture:start',
  stop: 'capture:stop',
  chunk: 'capture:chunk',
  started: 'capture:started',
  stopped: 'capture:stopped',
  error: 'capture:error',
} as const;

export interface CaptureOptions {
  frameRate: number;
  videoBitsPerSecond: number;
  audioBitsPerSecond: number;
}

export interface CaptureBridge {
  onStart(listener: (options: CaptureOptions) => void): void;
  onStop(listener: () => void): void;
  started(mimeType: string): void;
  chunk(data: ArrayBuffer): void;
  stopped(): void;
  error(message: string): void;
}
