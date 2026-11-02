import { useEffect, useState } from 'react';
import { CircleStop, Clock, Loader2, Maximize2, MonitorPlay, Radio, Send } from 'lucide-react';
import { CHAT_LIMIT } from '@shared/live';
import type { RecorderStatus } from '@shared/types';
import { duration, until } from '../../shared/format';
import { useAction, useNow } from '../../shared/hooks';
import { Badge, Button, ErrorText } from '../../shared/ui';

const TITLES = {
  idle: 'Сейчас ничего не записывается',
  joining: 'Подключаюсь к вебинару',
  waiting: 'Жду, пока преподаватель начнёт',
  recording: 'Идёт запись',
} as const;

/** What the recorder is doing, with a live preview of the hidden webinar window. */
export function StatusCard({ status }: { status: RecorderStatus }) {
  const now = useNow(1000);
  const [preview, setPreview] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const stop = useAction(() => window.api.stopRecording());
  const watch = useAction(() => window.api.watchLesson());
  const chat = useAction(async (text: string) => {
    await window.api.sendChat(text);
    setMessage('');
  });
  const active = status.state !== 'idle';
  const recording = status.state === 'recording';

  useEffect(() => {
    if (!active) return;
    let alive = true;
    const load = (): void => void window.api.getPreview().then((image) => alive && setPreview(image));
    load();
    const timer = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(timer);
      setPreview(null);
    };
  }, [active]);

  const lesson = status.lesson;
  return (
    <section className={`status-card status-${status.state}`}>
      <div className="status-info">
        <div className="status-kicker">
          {status.state === 'recording' && <Badge tone="live"><Radio size={12} /> REC {status.since ? duration(now - status.since) : ''}</Badge>}
          {(status.state === 'joining' || status.state === 'waiting') && <Badge tone="accent"><Loader2 size={12} className="spin" /> {status.state === 'joining' ? 'Вход' : 'Ожидание'}</Badge>}
          {status.state === 'idle' && <Badge><Clock size={12} /> Ожидаю пары</Badge>}
        </div>
        <h2>{TITLES[status.state]}</h2>
        {lesson ? (
          <div className="status-lesson">
            <strong>{lesson.subject}</strong>
            <span className="muted">{[lesson.type, `${lesson.startTime}–${lesson.endTime}`, lesson.teacher].filter(Boolean).join(' · ')}</span>
          </div>
        ) : status.next ? (
          <div className="status-lesson">
            <span className="muted">Следующая запись {until(status.next.startsAt - now)}</span>
            <strong>{status.next.subject}</strong>
            <span className="muted">{[status.next.type, `${status.next.startTime}–${status.next.endTime}`].filter(Boolean).join(' · ')}</span>
          </div>
        ) : (
          <p className="muted">В расписании пока нет пар с вебинарами.</p>
        )}
        {status.message && <p className="status-message">{status.message}</p>}
        {active && (
          <div className="status-actions">
            {recording && (
              <Button variant="primary" icon={<Maximize2 size={16} />} disabled={watch.busy} onClick={() => void watch.run()}>
                Смотреть
              </Button>
            )}
            <Button variant="danger" icon={<CircleStop size={16} />} disabled={stop.busy} onClick={() => void stop.run()}>
              Остановить
            </Button>
          </div>
        )}
        {recording && (
          <form className="inline-form status-chat" onSubmit={(event) => { event.preventDefault(); if (message.trim()) void chat.run(message.trim()); }}>
            <input
              value={message}
              maxLength={CHAT_LIMIT}
              placeholder="Написать в чат пары"
              aria-label="Сообщение в чат пары"
              disabled={chat.busy}
              onChange={(event) => setMessage(event.target.value)}
            />
            <Button type="submit" icon={<Send size={16} />} disabled={chat.busy || !message.trim()}>Отправить</Button>
          </form>
        )}
        <ErrorText>{stop.error ?? watch.error ?? chat.error}</ErrorText>
      </div>
      <div className="status-preview">
        {preview && recording ? (
          <button type="button" className="preview-open" title="Смотреть пару" onClick={() => void watch.run()}>
            <img src={preview} alt="Что сейчас видно в вебинаре" />
          </button>
        ) : preview ? (
          <img src={preview} alt="Что сейчас видно в вебинаре" />
        ) : (
          <div className="preview-placeholder">
            <MonitorPlay size={36} />
            <span>{active ? 'Загружаю превью…' : 'Здесь появится картинка из вебинара'}</span>
          </div>
        )}
      </div>
    </section>
  );
}
