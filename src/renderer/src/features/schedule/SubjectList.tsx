import { useMemo } from 'react';
import type { Lesson, Settings } from '@shared/types';
import { useAction } from '../../shared/hooks';
import { ErrorText, Switch } from '../../shared/ui';
import { subjects } from './lessons';

/** Per-subject recording switches; stored as `disabledSubjects`. */
export function SubjectList({ lessons, settings }: { lessons: readonly Lesson[]; settings: Settings }) {
  const list = useMemo(() => subjects(lessons), [lessons]);
  const toggle = useAction((key: string, enabled: boolean) => window.api.setSubjectEnabled(key, enabled));

  return (
    <aside className="subjects">
      <h2>Что записывать</h2>
      <p className="muted small">Пары без вебинара записать нельзя — их и не нужно включать.</p>
      <ul>
        {list.map((subject) => {
          const enabled = !settings.disabledSubjects.includes(subject.key);
          return (
            <li key={subject.key} className={subject.online ? '' : 'subject-offline'}>
              <div>
                <strong>{subject.name}</strong>
                <span className="muted small">{subject.online ? subject.types.join(', ') || 'Онлайн' : 'Только очно'}</span>
              </div>
              <Switch
                label={`Записывать «${subject.name}»`}
                checked={enabled && subject.online}
                disabled={!subject.online || toggle.busy}
                onChange={(value) => void toggle.run(subject.key, value)}
              />
            </li>
          );
        })}
      </ul>
      <ErrorText>{toggle.error}</ErrorText>
    </aside>
  );
}
