/**
 * Hidden page that records the webinar window. The main process answers
 * getDisplayMedia with the webinar's frame, so no picker is shown and the
 * room's sound is captured instead of played.
 */
import type { CaptureOptions } from '@shared/capture';

const MIME_TYPES = ['video/mp4;codecs=avc1.640028,opus', 'video/mp4;codecs=avc1,opus', 'video/webm;codecs=vp9,opus', 'video/webm'];

let recorder: MediaRecorder | null = null;
let stream: MediaStream | null = null;
let stopping = false;
/** Blob reads are async; chaining them keeps chunks in file order. */
let queue: Promise<void> = Promise.resolve();

async function start(options: CaptureOptions): Promise<void> {
  try {
    stream = await navigator.mediaDevices.getDisplayMedia({
      video: { frameRate: options.frameRate },
      // Raw room audio: speech processing is for microphones, not lectures.
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, channelCount: 2 },
    });
    const mimeType = MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? '';
    recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: options.videoBitsPerSecond,
      audioBitsPerSecond: options.audioBitsPerSecond,
    });
    // Chunks are written in order, so the file is playable up to the last second even after a crash.
    recorder.ondataavailable = (event) => {
      const blob = event.data;
      if (blob.size) queue = queue.then(async () => window.capture.chunk(await blob.arrayBuffer()));
    };
    recorder.onstop = () => {
      // The final ondataavailable fires before onstop; wait for its bytes too.
      void queue.then(() => window.capture.stopped());
    };
    recorder.onerror = () => window.capture.error('MediaRecorder остановился с ошибкой');
    // The webinar page went away (reload, crash): finish this part.
    for (const track of stream.getTracks()) track.onended = () => stop();
    recorder.start(1000);
    window.capture.started(recorder.mimeType || mimeType);
  } catch (error) {
    window.capture.error(error instanceof Error ? error.message : String(error));
  }
}

function stop(): void {
  if (stopping) return;
  stopping = true;
  if (recorder && recorder.state !== 'inactive') recorder.stop();
  else window.capture.stopped();
  for (const track of stream?.getTracks() ?? []) track.stop();
}

window.capture.onStart((options) => void start(options));
window.capture.onStop(stop);
