import { CircleDot, Link2Off, MapPin, PauseCircle, Radio, Video } from 'lucide-react';
import type { Lesson, RecorderStatus, Settings } from '@shared/types';
import { useAction } from '../../shared/hooks';
import { Badge, Button, ErrorText } from '../../shared/ui';
import { canRecordNow, lessonState } from './lessons';

const LABELS = {
  live: { tone: 'accent', text: 'Идёт сейчас', icon: Radio },
  record: { tone: 'ok', text: 'Запишется', icon: CircleDot },
  off: { tone: 'neutral', text: 'Не записывать', icon: PauseCircle },
  nolink: { tone: 'neutral', text: 'Без вебинара', icon: Link2Off },
  past: { tone: 'neutral', text: 'Прошла', icon: null },
} as const;

export function LessonRow({ lesson, settings, status, now }: {
  lesson: Lesson;
  settings: Settings;
  status: RecorderStatus | null;
  now: number;
}) {
  const record = useAction(() => window.api.recordNow(lesson.id));
  const state = lessonState(lesson, settings, now);
  const recording = status?.lesson?.id === lesson.id && status.state !== 'idle';
  const label = LABELS[state];
  const Icon = label.icon;

  return (
    <article className={`lesson lesson-${state} ${recording ? 'lesson-recording' : ''}`}>
      <div className="lesson-time">
        <strong>{lesson.startTime}</strong>
        <span>{lesson.endTime}</span>
      </div>
      <div className="lesson-body">
        <div className="lesson-title">
          <h3>{lesson.subject}</h3>
          {lesson.type && <span className="lesson-type">{lesson.type}</span>}
        </div>
        <div className="lesson-meta">
          {lesson.teacher && <span>{lesson.teacher}</span>}
          {lesson.rooms && <span><MapPin size={12} /> {lesson.rooms}</span>}
        </div>
        <ErrorText>{record.error}</ErrorText>
      </div>
      <div className="lesson-side">
        {recording ? (
          <Badge tone="live"><Radio size={12} /> {status?.state === 'recording' ? 'Пишется' : 'Подключаюсь'}</Badge>
        ) : (
          <Badge tone={label.tone}>{Icon && <Icon size={12} />} {label.text}</Badge>
        )}
        {!recording && canRecordNow(lesson, now) && (
          <Button variant="primary" icon={<Video size={14} />} disabled={record.busy} onClick={() => void record.run()}>
            Записать сейчас
          </Button>
        )}
      </div>
    </article>
  );
}
