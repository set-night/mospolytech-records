import { useState, type ReactNode } from 'react';
import { FolderOpen, Gauge, Power, UserRound, Users } from 'lucide-react';
import type { Quality, Settings } from '@shared/types';
import { errorText, useAction } from '../../shared/hooks';
import { Button, ErrorText, PageHeader, Switch } from '../../shared/ui';

const QUALITY: { value: Quality; label: string; hint: string }[] = [
  { value: 'low', label: 'Экономно', hint: '≈ 0,5 ГБ за пару' },
  { value: 'medium', label: 'Обычное', hint: '≈ 1 ГБ за пару' },
  { value: 'high', label: 'Чётко', hint: '≈ 2 ГБ за пару' },
];

function Row({ icon, title, hint, children }: { icon: ReactNode; title: string; hint: string; children: ReactNode }) {
  return (
    <div className="setting">
      <div className="setting-icon">{icon}</div>
      <div className="setting-text">
        <strong>{title}</strong>
        <span className="muted small">{hint}</span>
      </div>
      <div className="setting-control">{children}</div>
    </div>
  );
}

export function SettingsPage({ settings }: { settings: Settings }) {
  const [group, setGroup] = useState(settings.group);
  const [nickname, setNickname] = useState(settings.nickname);
  const [groupError, setGroupError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const save = useAction((patch: Partial<Settings>) => window.api.saveSettings(patch));
  const choose = useAction(async () => {
    const folder = await window.api.chooseFolder();
    if (folder) await window.api.saveSettings({ folder });
  });

  // Saved elsewhere (tray, onboarding): take the new value into the field.
  const [seen, setSeen] = useState(settings);
  if (seen !== settings) {
    setSeen(settings);
    if (seen.group !== settings.group) setGroup(settings.group);
    if (seen.nickname !== settings.nickname) setNickname(settings.nickname);
  }

  async function saveGroup(): Promise<void> {
    setGroupError(null);
    setChecking(true);
    try {
      const found = await window.api.checkGroup(group);
      if (!found) return setGroupError('Такой группы нет на rasp.dmami.ru');
      setGroup(found);
      await window.api.saveSettings({ group: found });
    } catch (caught) {
      setGroupError(errorText(caught));
    } finally {
      setChecking(false);
    }
  }

  const groupChanged = group.trim() !== settings.group;
  const nicknameChanged = nickname.trim() !== settings.nickname && nickname.trim().length > 0;

  return (
    <div className="page">
      <PageHeader title="Настройки" subtitle="Всё сохраняется сразу" />
      <div className="settings">
        <Row icon={<Users size={18} />} title="Группа" hint="Расписание берётся с rasp.dmami.ru">
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void saveGroup(); }}>
            <input value={group} onChange={(event) => setGroup(event.target.value)} aria-label="Номер группы" />
            {groupChanged && <Button type="submit" variant="primary" disabled={checking || !group.trim()}>{checking ? 'Проверяю…' : 'Сохранить'}</Button>}
          </form>
        </Row>
        <ErrorText>{groupError}</ErrorText>

        <Row icon={<FolderOpen size={18} />} title="Папка для записей" hint="Новые записи будут сохраняться сюда">
          <div className="folder-picker">
            <code title={settings.folder}>{settings.folder}</code>
            <Button disabled={choose.busy} onClick={() => void choose.run()}>Изменить…</Button>
          </div>
        </Row>

        <Row icon={<UserRound size={18} />} title="Имя в вебинаре" hint="Так тебя увидят в списке участников">
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); void save.run({ nickname: nickname.trim() }); }}>
            <input value={nickname} maxLength={60} onChange={(event) => setNickname(event.target.value)} aria-label="Имя в вебинаре" />
            {nicknameChanged && <Button type="submit" variant="primary" disabled={save.busy}>Сохранить</Button>}
          </form>
        </Row>

        <Row icon={<Gauge size={18} />} title="Качество видео" hint="Влияет на размер файлов">
          <div className="segmented" role="radiogroup" aria-label="Качество видео">
            {QUALITY.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={settings.quality === option.value}
                className={settings.quality === option.value ? 'segmented-on' : ''}
                title={option.hint}
                onClick={() => void save.run({ quality: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </Row>

        <Row icon={<Power size={18} />} title="Запускать вместе с компьютером" hint="Приложение тихо стартует в трее и ничего не пропустит">
          <Switch label="Автозапуск" checked={settings.autoStart} onChange={(autoStart) => void save.run({ autoStart })} />
        </Row>
        <ErrorText>{save.error ?? choose.error}</ErrorText>
      </div>
    </div>
  );
}
