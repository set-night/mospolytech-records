import { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, FolderOpen, Users, UserRound } from 'lucide-react';
import type { Settings } from '@shared/types';
import { errorText } from '../../shared/hooks';
import { Button, ErrorText, Logo } from '../../shared/ui';

const STEPS = ['Группа', 'Папка', 'Имя'] as const;

export function Onboarding({ settings }: { settings: Settings }) {
  const [step, setStep] = useState(0);
  const [group, setGroup] = useState(settings.group);
  const [folder, setFolder] = useState(settings.folder);
  const [nickname, setNickname] = useState(settings.nickname);
  const [groups, setGroups] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void window.api.listGroups().then(setGroups).catch(() => setGroups([]));
  }, []);

  async function next(): Promise<void> {
    setError(null);
    if (step === 0) {
      setBusy(true);
      try {
        const found = await window.api.checkGroup(group);
        if (!found) return setError('Такой группы нет на rasp.dmami.ru. Проверь номер, например 231-321.');
        setGroup(found);
        setStep(1);
      } catch (caught) {
        setError(`Не получилось проверить группу: ${errorText(caught)}`);
      } finally {
        setBusy(false);
      }
      return;
    }
    if (step === 1) return setStep(2);
    setBusy(true);
    try {
      await window.api.saveSettings({ group, folder, nickname: nickname.trim() || 'Слушатель', onboarded: true });
    } catch (caught) {
      setError(errorText(caught));
      setBusy(false);
    }
  }

  async function chooseFolder(): Promise<void> {
    const chosen = await window.api.chooseFolder();
    if (chosen) setFolder(chosen);
  }

  const canContinue = step === 0 ? group.trim().length > 0 : step === 2 ? nickname.trim().length > 0 : true;

  return (
    <div className="onboarding">
      <div className="onboarding-card">
        <div className="onboarding-hero">
          <Logo size={52} />
          <h1>Добро пожаловать!</h1>
          <p className="muted">
            MosPolytech Records сам заходит на онлайн-пары в МТС Линк по твоему расписанию и сохраняет видео на компьютер.
            Настроим всё за минуту.
          </p>
        </div>

        <ol className="stepper">
          {STEPS.map((label, index) => (
            <li key={label} className={index === step ? 'step-current' : index < step ? 'step-done' : ''}>
              <span>{index < step ? <Check size={14} /> : index + 1}</span>
              {label}
            </li>
          ))}
        </ol>

        <form
          className="onboarding-body"
          onSubmit={(event) => {
            event.preventDefault();
            if (canContinue && !busy) void next();
          }}
        >
          {step === 0 && (
            <label className="field">
              <span className="field-label"><Users size={16} /> Номер твоей группы</span>
              <input
                autoFocus
                list="groups"
                value={group}
                placeholder="Например, 231-321"
                onChange={(event) => setGroup(event.target.value)}
              />
              <datalist id="groups">{groups.map((item) => <option key={item} value={item} />)}</datalist>
              <span className="hint">Расписание берётся с rasp.dmami.ru. Группу можно поменять потом в настройках.</span>
            </label>
          )}
          {step === 1 && (
            <div className="field">
              <span className="field-label"><FolderOpen size={16} /> Куда сохранять записи</span>
              <div className="folder-picker">
                <code title={folder}>{folder}</code>
                <Button onClick={() => void chooseFolder()}>Выбрать…</Button>
              </div>
              <span className="hint">Одна пара — один видеофайл. Полтора часа в среднем качестве — примерно 1 ГБ.</span>
            </div>
          )}
          {step === 2 && (
            <label className="field">
              <span className="field-label"><UserRound size={16} /> Как тебя подписать в вебинаре</span>
              <input autoFocus value={nickname} maxLength={60} onChange={(event) => setNickname(event.target.value)} />
              <span className="hint">Это имя увидят преподаватель и одногруппники в списке участников.</span>
            </label>
          )}

          <ErrorText>{error}</ErrorText>

          <div className="onboarding-actions">
            {step > 0 ? <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(step - 1)}>Назад</Button> : <span />}
            <Button type="submit" variant="primary" disabled={!canContinue || busy} icon={step === 2 ? <Check size={16} /> : <ArrowRight size={16} />}>
              {busy ? 'Минутку…' : step === 2 ? 'Готово' : 'Дальше'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
