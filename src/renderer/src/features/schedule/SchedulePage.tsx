import { useMemo, useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import type { RecorderStatus, Settings } from '@shared/types';
import { addDays, capitalize, dayTitle, moscowDate, shortDate, weekStart } from '../../shared/format';
import { useAction, useNow, useSchedule } from '../../shared/hooks';
import { Button, Empty, ErrorText, PageHeader } from '../../shared/ui';
import { LessonRow } from './LessonRow';
import { SubjectList } from './SubjectList';

export function SchedulePage({ settings, status }: { settings: Settings; status: RecorderStatus | null }) {
  const state = useSchedule();
  const now = useNow();
  const today = moscowDate(now);
  const [week, setWeek] = useState(() => weekStart(today));
  const refresh = useAction(() => window.api.refreshSchedule());
  const lessons = useMemo(() => state?.schedule?.lessons ?? [], [state]);

  const days = useMemo(() => {
    const result: { date: string; lessons: typeof lessons }[] = [];
    for (let index = 0; index < 7; index += 1) {
      const date = addDays(week, index);
      const items = lessons.filter((lesson) => lesson.date === date);
      if (items.length || index < 6) result.push({ date, lessons: items });
    }
    return result;
  }, [lessons, week]);

  const updated = state?.schedule ? new Date(state.schedule.fetchedAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' }) : null;

  return (
    <div className="page">
      <PageHeader
        title="Расписание"
        subtitle={<>Группа {settings.group}{updated && <> · обновлено {updated}</>}</>}
        actions={
          <Button icon={<RefreshCw size={16} className={state?.loading ? 'spin' : ''} />} disabled={state?.loading} onClick={() => void refresh.run()}>
            Обновить
          </Button>
        }
      />
      <ErrorText>{state?.error ?? refresh.error}</ErrorText>

      <div className="week-bar">
        <Button variant="ghost" icon={<ChevronLeft size={18} />} aria-label="Предыдущая неделя" onClick={() => setWeek(addDays(week, -7))} />
        <div className="week-title">
          <strong>{shortDate(week)} — {shortDate(addDays(week, 6))}</strong>
          {week !== weekStart(today) && <button type="button" className="link" onClick={() => setWeek(weekStart(today))}>к текущей неделе</button>}
        </div>
        <Button variant="ghost" icon={<ChevronRight size={18} />} aria-label="Следующая неделя" onClick={() => setWeek(addDays(week, 7))} />
      </div>

      {!state?.schedule ? (
        <Empty icon={<CalendarDays size={28} />} title={state?.loading ? 'Загружаю расписание…' : 'Расписание не загружено'} />
      ) : (
        <div className="schedule-layout">
          <div className="week">
            {days.map(({ date, lessons: items }) => (
              <section key={date} className={`day ${date === today ? 'day-today' : ''}`}>
                <h3 className="day-title">
                  {capitalize(dayTitle(date))}
                  {date === today && <span className="today-chip">сегодня</span>}
                </h3>
                {items.length ? (
                  <div className="lesson-list">
                    {items.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} settings={settings} status={status} now={now} />)}
                  </div>
                ) : (
                  <p className="day-empty">Пар нет</p>
                )}
              </section>
            ))}
          </div>
          <SubjectList lessons={lessons} settings={settings} />
        </div>
      )}
    </div>
  );
}
