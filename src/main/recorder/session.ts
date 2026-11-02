import { createWriteStream, mkdirSync, type WriteStream } from 'node:fs';
import { app, BrowserWindow, ipcMain, powerSaveBlocker, session, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron';
import { CAPTURE_CHANNELS, type CaptureOptions } from '@shared/capture';
import { chatText, LIVE_CHANNELS } from '@shared/live';
import type { Lesson, Quality, RecordingMeta } from '@shared/types';
import { freePath, recordingName, writeMeta } from '../recordings/library';
import { preloadPath, loadPage } from '../pages';
import { iconPath } from '../tray';
import { chatScript, type ChatProbe } from './chat';
import { CLICK_TARGET, probeScript, webinarRoom, type Probe } from './probe';

export type SessionPhase = 'joining' | 'waiting' | 'recording' | 'finished';

export interface SessionConfig {
  lesson: Lesson;
  link: string;
  folder: string;
  nickname: string;
  quality: Quality;
  /** Hard stop even if the room never says it ended. */
  stopAt: number;
}

const QUALITY: Record<Quality, CaptureOptions> = {
  low: { frameRate: 15, videoBitsPerSecond: 800_000, audioBitsPerSecond: 96_000 },
  medium: { frameRate: 25, videoBitsPerSecond: 1_500_000, audioBitsPerSecond: 128_000 },
  high: { frameRate: 30, videoBitsPerSecond: 3_000_000, audioBitsPerSecond: 160_000 },
};

const CAPTURE_PARTITION = 'mpr-capture';
const SECOND = 1000;

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * One lesson: joins the room in an invisible window, records it through a
 * hidden capture page and keeps rejoining until the room ends or time runs out.
 * A reconnect during the lesson starts a new part file.
 */
export class RecordingSession {
  phase: SessionPhase = 'joining';
  message: string | null = 'Открываю вебинар';
  file: string | null = null;
  since: number | null = null;

  private meeting: BrowserWindow | null = null;
  private capture: BrowserWindow | null = null;
  private viewer: BrowserWindow | null = null;
  private chatting = false;
  private stream: WriteStream | null = null;
  private meta: RecordingMeta | null = null;
  private part = 0;
  private recorded = false;
  private timer: NodeJS.Timeout | null = null;
  private blocker: number | null = null;
  private stopping: Promise<void> | null = null;
  private onCaptureStopped: (() => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly finished: Promise<void>;
  private resolveFinished!: () => void;

  // Join loop bookkeeping.
  private signature = '';
  private changedAt = Date.now();
  private loadedAt = Date.now();
  private lastClick = 0;
  private clicks = 0;
  private ended = 0;
  private leaveMissing = 0;
  private leaveHidden = 0;

  private readonly handlers: Record<string, (event: IpcMainEvent, ...args: unknown[]) => void>;

  constructor(private readonly config: SessionConfig) {
    this.finished = new Promise((resolve) => { this.resolveFinished = resolve; });
    this.handlers = {
      [CAPTURE_CHANNELS.started]: (event, mime) => this.fromCapture(event) && this.onStarted(String(mime)),
      [CAPTURE_CHANNELS.chunk]: (event, data) => this.fromCapture(event) && data instanceof ArrayBuffer && this.onChunk(data),
      [CAPTURE_CHANNELS.stopped]: (event) => this.fromCapture(event) && this.onStopped(),
      [CAPTURE_CHANNELS.error]: (event, message) => this.fromCapture(event) && this.onCaptureError(String(message)),
      [LIVE_CHANNELS.fullscreen]: (event, on) => {
        const viewer = this.fromViewer(event);
        viewer?.setFullScreen(typeof on === 'boolean' ? on : !viewer.isFullScreen());
      },
    };
  }

  get lesson(): Lesson {
    return this.config.lesson;
  }

  /** Resolves once the session is over and its files are closed. */
  get done(): Promise<void> {
    return this.finished;
  }

  onUpdate(listener: () => void): void {
    this.listeners.add(listener);
  }

  start(): void {
    for (const [channel, handler] of Object.entries(this.handlers)) ipcMain.on(channel, handler);
    ipcMain.handle(LIVE_CHANNELS.chat, (event: IpcMainInvokeEvent, text: unknown) => {
      if (!this.fromViewer(event)) throw new Error('Forbidden');
      return this.sendChat(chatText(text));
    });
    session.fromPartition(CAPTURE_PARTITION).setDisplayMediaRequestHandler((_request, callback) => {
      const frame = this.meeting?.webContents.mainFrame;
      // Capturing the frame (not the screen) also keeps its audio off the speakers.
      if (frame) callback({ video: frame, audio: frame });
      else callback({});
    });
    this.blocker = powerSaveBlocker.start('prevent-app-suspension');
    this.openMeeting();
    this.schedule(SECOND);
  }

  /** Stops recording and closes everything; safe to call more than once. */
  stop(message: string, status: 'done' | 'partial' = 'done'): Promise<void> {
    this.stopping ??= this.shutdown(message, status);
    return this.stopping;
  }

  async preview(): Promise<string | null> {
    if (!this.meeting || this.meeting.isDestroyed()) return null;
    const image = await this.meeting.webContents.capturePage();
    return image.isEmpty() ? null : image.resize({ width: 640 }).toDataURL();
  }

  /**
   * Opens the lesson in a window of its own, fullscreen and muted. It shows the
   * same frame the recording captures, so watching never disturbs the file.
   */
  watch(): void {
    if (this.phase !== 'recording') throw new Error('Смотреть можно, когда идёт запись');
    if (this.viewer && !this.viewer.isDestroyed()) {
      if (this.viewer.isMinimized()) this.viewer.restore();
      this.viewer.show();
      this.viewer.focus();
      return;
    }
    const viewer = new BrowserWindow({
      width: 1280,
      height: 760,
      show: false,
      title: this.config.lesson.subject,
      backgroundColor: '#000000',
      icon: iconPath('icon.png'),
      autoHideMenuBar: true,
      webPreferences: {
        preload: preloadPath('live'),
        // Its getDisplayMedia is answered with the webinar frame, like the recorder's.
        partition: CAPTURE_PARTITION,
        sandbox: true,
        contextIsolation: true,
      },
    });
    // Some window managers ignore `fullscreen` on a window that is not shown yet.
    viewer.once('ready-to-show', () => {
      viewer.show();
      viewer.setFullScreen(true);
    });
    viewer.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    viewer.webContents.on('will-navigate', (event) => event.preventDefault());
    viewer.on('closed', () => { if (this.viewer === viewer) this.viewer = null; });
    this.viewer = viewer;
    void loadPage(viewer, 'live', encodeURIComponent(this.config.lesson.subject)).catch(() => undefined);
  }

  /** Types a message into the room's chat under the recorder's name. */
  async sendChat(text: string): Promise<void> {
    if (this.phase !== 'recording' || !this.meeting) throw new Error('Писать в чат можно, когда идёт запись');
    if (this.chatting) throw new Error('Предыдущее сообщение ещё отправляется');
    this.chatting = true;
    try {
      await this.typeChat(text);
    } finally {
      this.chatting = false;
    }
  }

  private async typeChat(text: string): Promise<void> {
    let probe = await this.chatProbe();
    // The panel may be closed; open it just for this message so the recording keeps its layout.
    const opened = !probe.input && !!probe.toggle;
    if (!probe.input && probe.toggle) {
      this.mouseClick(probe.toggle.x, probe.toggle.y);
      await delay(1500);
      probe = await this.chatProbe();
    }
    if (!probe.input) throw new Error('Не нашёл чат в вебинаре — возможно, его отключили');
    this.mouseClick(probe.input.x, probe.input.y);
    await delay(200);
    if (probe.input.text) this.selectAll();
    await this.meeting?.webContents.insertText(text);
    await delay(400);
    const typed = await this.chatProbe();
    if (typed.send) {
      this.mouseClick(typed.send.x, typed.send.y);
    } else {
      this.meeting?.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
      this.meeting?.webContents.sendInputEvent({ type: 'char', keyCode: '\r' });
      this.meeting?.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
    }
    await delay(1000);
    const after = await this.chatProbe();
    if (opened && after.toggle) this.mouseClick(after.toggle.x, after.toggle.y);
    // The room clears the field once the message is posted.
    if (after.input?.text) throw new Error('Сообщение не отправилось — возможно, чат закрыт для слушателей');
  }

  private async chatProbe(): Promise<ChatProbe> {
    const empty: ChatProbe = { input: null, toggle: null, send: null };
    const contents = this.meeting?.webContents;
    if (!contents || contents.isDestroyed()) return empty;
    const result = contents.executeJavaScript(chatScript()) as Promise<ChatProbe>;
    return result.catch(() => empty);
  }

  private fromViewer(event: IpcMainEvent | IpcMainInvokeEvent): BrowserWindow | null {
    const viewer = this.viewer;
    return viewer && !viewer.isDestroyed() && event.sender === viewer.webContents ? viewer : null;
  }

  private openMeeting(): void {
    const meeting = new BrowserWindow({
      show: false,
      useContentSize: true,
      width: 1280,
      height: 720,
      webPreferences: {
        // Offscreen windows paint at full rate while hidden.
        offscreen: true,
        backgroundThrottling: false,
        partition: 'mpr-webinar',
        sandbox: true,
        contextIsolation: true,
      },
    });
    meeting.webContents.setFrameRate(QUALITY[this.config.quality].frameRate);
    meeting.webContents.setAudioMuted(true);
    // Some rooms refuse unknown browsers; look like plain Chrome.
    meeting.webContents.setUserAgent(app.userAgentFallback.replace(/ (Electron|mospolytech-records)\/\S+/gi, ''));
    meeting.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    // A listener needs no camera, microphone or notifications.
    meeting.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    meeting.webContents.on('render-process-gone', () => this.reload('Вкладка вебинара упала, перезапускаю'));
    meeting.on('closed', () => { if (this.meeting === meeting) this.meeting = null; });
    this.meeting = meeting;
    this.navigate();
  }

  private navigate(): void {
    this.loadedAt = Date.now();
    this.changedAt = Date.now();
    this.signature = '';
    this.clicks = 0;
    this.meeting?.loadURL(webinarRoom(this.config.link)).catch(() => {
      // Network errors surface as a page without a join form; the loop retries.
    });
  }

  private reload(message: string): void {
    this.update('joining', message);
    if (!this.meeting || this.meeting.isDestroyed()) this.openMeeting();
    else this.navigate();
  }

  private schedule(delay: number): void {
    if (this.phase === 'finished' || this.stopping) return;
    this.timer = setTimeout(() => void this.tick(), delay);
  }

  private async tick(): Promise<void> {
    if (Date.now() >= this.config.stopAt) {
      await this.stop('Пара закончилась');
      return;
    }
    const probe = await this.probe();
    if (this.stopping) return;
    await this.act(probe);
    this.schedule(this.capture ? 8 * SECOND : 3 * SECOND);
  }

  private async probe(): Promise<Probe> {
    const contents = this.meeting?.webContents;
    if (!contents || contents.isDestroyed() || contents.isLoading()) return { state: 'loading', text: '' };
    const timeout = new Promise<Probe>((resolve) => setTimeout(() => resolve({ state: 'loading', text: '' }), 10 * SECOND));
    const result = contents.executeJavaScript(probeScript(this.config.nickname)) as Promise<Probe>;
    return Promise.race([result.catch((): Probe => ({ state: 'loading', text: '' })), timeout]);
  }

  private async act(probe: Probe): Promise<void> {
    const now = Date.now();
    const signature = probe.state === 'loading' || probe.state === 'waiting' || probe.state === 'ended' ? `${probe.state}:${probe.text}` : probe.state;
    if (signature !== this.signature) {
      this.signature = signature;
      this.changedAt = now;
    }

    if (this.capture) {
      if (probe.state === 'joined') {
        this.leaveMissing = 0;
        this.leaveHidden = probe.leaveVisible ? 0 : this.leaveHidden + 1;
        // The control bar hides itself sometimes; only a long absence means we were kicked.
        if (this.leaveHidden < 8) return;
      } else if (probe.state === 'ended') {
        this.ended += 1;
        if (this.ended >= 3) await this.stop('Вебинар завершён');
        return;
      } else {
        this.leaveMissing += 1;
        if (this.leaveMissing < 3) return;
      }
      await this.stopCapture('partial', 'Потеряно соединение с вебинаром');
      this.reload('Переподключаюсь к вебинару');
      return;
    }

    switch (probe.state) {
      case 'joined':
        this.ended = 0;
        await this.startCapture();
        return;
      case 'fill':
        this.update('joining', 'Ввожу имя');
        this.mouseClick(probe.x, probe.y);
        this.selectAll();
        this.meeting?.webContents.insertText(this.config.nickname);
        return;
      case 'click': {
        // A join button without a name form is pressed at most every 5 s.
        if (now - this.lastClick < (probe.submit ? 2 : 5) * SECOND) return;
        this.update('joining', 'Вхожу в вебинар');
        this.lastClick = now;
        this.clicks += 1;
        // Alternate trusted mouse input with a DOM click: some buttons react only to one of them.
        if (this.clicks % 2 === 1) this.mouseClick(probe.x, probe.y);
        else await this.meeting?.webContents.executeJavaScript(CLICK_TARGET).catch(() => false);
        return;
      }
      case 'ended':
        // Before we ever recorded, "ended" may be last week's session in a reused room.
        this.update('waiting', this.recorded ? 'Вебинар завершён, жду повторного запуска' : 'Вебинар ещё не начался');
        if (now - this.loadedAt > 30 * SECOND) this.navigate();
        return;
      case 'waiting':
        this.update('waiting', 'Жду начала вебинара');
        if (now - this.changedAt > 5 * 60 * SECOND) this.navigate();
        return;
      case 'loading':
        if (now - this.changedAt > 45 * SECOND) this.reload('Страница не отвечает, перезагружаю');
    }
  }

  private mouseClick(x: number, y: number): void {
    const contents = this.meeting?.webContents;
    if (!contents) return;
    contents.sendInputEvent({ type: 'mouseMove', x, y });
    contents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
    contents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
  }

  private selectAll(): void {
    const contents = this.meeting?.webContents;
    if (!contents) return;
    const modifiers: Array<'meta' | 'control'> = [process.platform === 'darwin' ? 'meta' : 'control'];
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers });
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers });
  }

  private async startCapture(): Promise<void> {
    this.update('joining', 'Начинаю запись');
    const capture = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: preloadPath('capture'),
        partition: CAPTURE_PARTITION,
        backgroundThrottling: false,
        sandbox: true,
        contextIsolation: true,
      },
    });
    this.capture = capture;
    this.leaveMissing = 0;
    this.leaveHidden = 0;
    capture.webContents.on('render-process-gone', () => void this.stopCapture('partial', 'Сбой записи'));
    try {
      await loadPage(capture, 'capture');
      capture.webContents.send(CAPTURE_CHANNELS.start, QUALITY[this.config.quality]);
    } catch {
      this.closeCapture();
    }
  }

  private fromCapture(event: IpcMainEvent): boolean {
    return !!this.capture && !this.capture.isDestroyed() && event.sender === this.capture.webContents;
  }

  private onStarted(mime: string): void {
    const { lesson, folder } = this.config;
    this.part += 1;
    mkdirSync(folder, { recursive: true });
    const file = freePath(folder, recordingName(lesson, this.part, mime.includes('webm') ? 'webm' : 'mp4'));
    this.stream = createWriteStream(file);
    this.stream.on('error', () => void this.stop('Не удалось записать файл: проверьте место на диске', 'partial'));
    this.file = file;
    this.since = Date.now();
    this.recorded = true;
    this.meta = {
      lessonId: lesson.id,
      subject: lesson.subject,
      type: lesson.type,
      teacher: lesson.teacher,
      date: lesson.date,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      link: this.config.link,
      startedAt: this.since,
      finishedAt: null,
      status: 'recording',
      note: null,
    };
    writeMeta(folder, file, this.meta);
    // The capture keeps the sound off the speakers by itself.
    this.meeting?.webContents.setAudioMuted(false);
    this.update('recording', null);
  }

  private onChunk(data: ArrayBuffer): void {
    this.stream?.write(Buffer.from(data));
  }

  /** Fired after a requested stop, or by itself when the captured page went away. */
  private onStopped(): void {
    if (this.onCaptureStopped) this.onCaptureStopped();
    else void this.stopCapture('partial', 'Запись прервалась');
  }

  private onCaptureError(message: string): void {
    this.update('joining', `Ошибка записи: ${message}`);
    void this.stopCapture('partial', message);
  }

  private async stopCapture(status: 'done' | 'partial', note: string | null): Promise<void> {
    const capture = this.capture;
    if (!capture) return;
    if (this.stream && !capture.isDestroyed()) {
      // Let MediaRecorder flush its last fragment.
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(resolve, 10 * SECOND);
        this.onCaptureStopped = () => { clearTimeout(timeout); resolve(); };
        capture.webContents.send(CAPTURE_CHANNELS.stop);
      });
    }
    this.onCaptureStopped = null;
    this.closeCapture();
    this.meeting?.webContents.setAudioMuted(true);
    const stream = this.stream;
    this.stream = null;
    if (stream) await new Promise<void>((resolve) => stream.end(resolve));
    if (this.meta && this.file) {
      this.meta = { ...this.meta, finishedAt: Date.now(), status, note };
      writeMeta(this.config.folder, this.file, this.meta);
    }
    this.meta = null;
    this.since = null;
  }

  private closeCapture(): void {
    const capture = this.capture;
    this.capture = null;
    if (capture && !capture.isDestroyed()) capture.destroy();
  }

  private async shutdown(message: string, status: 'done' | 'partial'): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    await this.stopCapture(status, status === 'partial' ? message : null);
    if (this.viewer && !this.viewer.isDestroyed()) this.viewer.destroy();
    this.viewer = null;
    if (this.meeting && !this.meeting.isDestroyed()) this.meeting.destroy();
    this.meeting = null;
    for (const [channel, handler] of Object.entries(this.handlers)) ipcMain.removeListener(channel, handler);
    ipcMain.removeHandler(LIVE_CHANNELS.chat);
    if (this.blocker !== null) powerSaveBlocker.stop(this.blocker);
    this.blocker = null;
    this.update('finished', message);
    this.resolveFinished();
  }

  private update(phase: SessionPhase, message: string | null): void {
    if (this.phase === phase && this.message === message) return;
    this.phase = phase;
    this.message = message;
    for (const listener of this.listeners) listener();
  }
}
