import { useEffect, useState } from 'react';
import { ExternalLink, FileText, RefreshCw, ShieldCheck } from 'lucide-react';
import { APP_NAME, type AppInfo, type RecorderStatus, type UpdateState } from '@shared/types';
import { useAction, useNow } from '../../shared/hooks';
import { Button, ErrorText, Logo } from '../../shared/ui';
import { ReleaseNotes } from './ReleaseNotes';
import { isNews, updateLine } from './update';
import { UpdateBanner } from './UpdateBanner';
import { WhatsNew } from './WhatsNew';

function UpdateStatus({ update }: { update: UpdateState }) {
  const now = useNow();
  const check = useAction(() => window.api.checkUpdates());
  const working = update.stage === 'checking' || update.stage === 'downloading' || check.busy;
  return (
    <div className="update-status">
      <span className={update.stage === 'error' ? 'update-status-error' : 'muted'}>{updateLine(update, now)}</span>
      <Button variant="ghost" icon={<RefreshCw size={14} />} disabled={working} onClick={() => void check.run()}>Проверить</Button>
      <ErrorText>{check.error}</ErrorText>
    </div>
  );
}

export function AboutPage({ update, status }: { update: UpdateState | null; status: RecorderStatus | null }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.api.getInfo().then(setInfo);
  }, []);

  return (
    <div className="page about">
      <UpdateBanner update={update} status={status} />
      <WhatsNew update={update} />
      <div className="about-hero">
        <Logo size={88} />
        <h1>{APP_NAME}</h1>
        <p className="muted">Версия {update?.current ?? info?.version ?? '…'}</p>
        {update && <UpdateStatus update={update} />}
        <p className="about-text">
          Сам заходит на онлайн-пары Московского Политеха в МТС Линк по расписанию группы и сохраняет их на твой компьютер.
          Работает только у тебя: без серверов, аккаунтов и сбора данных.
        </p>
        <div className="about-actions">
          <Button variant="primary" icon={<ExternalLink size={16} />} onClick={() => void window.api.openRepo()}>Проект на GitHub</Button>
          <Button icon={<FileText size={16} />} onClick={() => void window.api.showLog()}>Журнал работы</Button>
        </div>
        <p className="muted small about-note">
          <ShieldCheck size={16} />
          <span>Открытый код под лицензией MIT. Нашёл ошибку — открой issue на GitHub и приложи журнал работы.</span>
        </p>
      </div>
      {isNews(update) && update.notes.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>Что нового в версии {update.latest}</h2></div>
          <ReleaseNotes sections={update.notes} />
        </section>
      )}
    </div>
  );
}
