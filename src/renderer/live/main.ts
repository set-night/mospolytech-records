/**
 * The lesson being recorded, shown full screen. The main process answers
 * getDisplayMedia with the webinar's frame, the same one the recording takes,
 * so watching joins nothing new. Sound starts muted.
 */
import './style.css';
import { errorText } from '@shared/errors';

const element = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const video = element<HTMLVideoElement>('video');
const wait = element<HTMLParagraphElement>('wait');
const sound = element<HTMLButtonElement>('sound');
const screen = element<HTMLButtonElement>('screen');
const chat = element<HTMLFormElement>('chat');
const message = element<HTMLInputElement>('message');
const note = element<HTMLSpanElement>('note');

const subject = decodeURIComponent(location.hash.slice(1));
element('title').textContent = subject;
if (subject) document.title = subject;

let current: MediaStream | null = null;
let reconnect = 0;

async function connect(): Promise<void> {
  try {
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: true,
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    current = stream;
    // The room reloads after a reconnect; pick its new frame up.
    for (const track of stream.getTracks()) track.onended = () => retry(stream);
    video.srcObject = stream;
    wait.hidden = true;
  } catch {
    retry(null);
  }
}

/** Both tracks of a stream end together: only the first call for it schedules a reconnect. */
function retry(stream: MediaStream | null): void {
  if (stream !== current || reconnect) return;
  for (const track of stream?.getTracks() ?? []) {
    track.onended = null;
    track.stop();
  }
  current = null;
  video.srcObject = null;
  wait.hidden = false;
  reconnect = window.setTimeout(() => {
    reconnect = 0;
    void connect();
  }, 2500);
}

function toggleSound(): void {
  video.muted = !video.muted;
  sound.textContent = video.muted ? 'Включить звук' : 'Выключить звук';
}

let full = true;
function toggleScreen(on = !full): void {
  full = on;
  window.live.fullscreen(on);
  screen.textContent = on ? 'Свернуть в окно' : 'Во весь экран';
}

function say(text: string, error = false): void {
  note.textContent = text;
  note.className = error ? 'error' : '';
}

let idle = 0;
function wake(): void {
  document.body.classList.remove('idle');
  clearTimeout(idle);
  idle = window.setTimeout(() => {
    // Keep the bar while the user is typing.
    if (document.activeElement !== message) document.body.classList.add('idle');
  }, 3000);
}

sound.addEventListener('click', toggleSound);
screen.addEventListener('click', () => toggleScreen());
chat.addEventListener('submit', (event) => {
  event.preventDefault();
  const text = message.value.trim();
  if (!text) return;
  message.disabled = true;
  say('Отправляю…');
  window.live.sendChat(text)
    .then(() => {
      message.value = '';
      say('Отправлено');
    })
    .catch((error: unknown) => say(errorText(error), true))
    .finally(() => {
      message.disabled = false;
      message.focus();
    });
});

document.addEventListener('keydown', (event) => {
  wake();
  if (event.target === message) {
    if (event.key === 'Escape') message.blur();
    return;
  }
  if (event.key === 'Escape') toggleScreen(false);
  else if (event.key === 'f' || event.key === 'F' || event.key === 'а' || event.key === 'А') toggleScreen();
  else if (event.key === 'm' || event.key === 'M' || event.key === 'ь' || event.key === 'Ь') toggleSound();
});
document.addEventListener('mousemove', wake);
video.addEventListener('dblclick', () => toggleScreen());

wake();
void connect();
