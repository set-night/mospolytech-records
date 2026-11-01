import { ArrowRight, CalendarCheck2, CalendarDays } from 'lucide-react';
import type { RecorderStatus, Settings } from '@shared/types';
import { capitalize, dayTitle, moscowDate } from '../../shared/format';
import { useNow, useSchedule } from '../../shared/hooks';
import { Button, Empty, PageHeader } from '../../shared/ui';
import { LessonRow } from '../schedule/LessonRow';
import { StatusCard } from './StatusCard';

export function HomePage({ settings, status, onNavigate }: {
  settings: Settings;
  status: RecorderStatus | null;
  onNavigate: (page: 'schedule' | 'recordings') => void;
}) {
  const schedule = useSchedule();
  const now = useNow();
  const today = moscowDate(now);
  const lessons = schedule?.schedule?.lessons.filter((lesson) => lesson.date === today) ?? [];

  return (
    <div className="page">
      <PageHeader title="Главная" subtitle={capitalize(dayTitle(today))} />
      {status && <StatusCard status={status} />}
      <section className="section">
        <div className="section-head">
          <h2>Сегодня</h2>
          <Button variant="ghost" icon={<ArrowRight size={16} />} onClick={() => onNavigate('schedule')}>Всё расписание</Button>
        </div>
        {lessons.length ? (
          <div className="lesson-list">
            {lessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} settings={settings} status={status} now={now} />)}
          </div>
        ) : schedule?.schedule ? (
          <Empty icon={<CalendarCheck2 size={28} />} title="Сегодня пар нет">Можно отдохнуть — запись включится сама, когда начнётся следующая пара.</Empty>
        ) : (
          <Empty icon={<CalendarDays size={28} />} title={schedule?.loading ? 'Загружаю расписание…' : 'Расписание ещё не загружено'}>
            {schedule?.error}
          </Empty>
        )}
      </section>
    </div>
  );
}
