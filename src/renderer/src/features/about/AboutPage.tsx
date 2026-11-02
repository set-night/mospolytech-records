import { useEffect, useState } from 'react';
import { ExternalLink, FileText, ShieldCheck } from 'lucide-react';
import { APP_NAME, type AppInfo, type RecorderStatus, type UpdateInfo } from '@shared/types';
import { Button, Logo } from '../../shared/ui';
import { UpdateBanner } from './UpdateBanner';

export function AboutPage({ update, status }: { update: UpdateInfo | null; status: RecorderStatus | null }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.api.getInfo().then(setInfo);
  }, []);

  return (
    <div className="page about">
      {update && <UpdateBanner update={update} status={status} />}
      <div className="about-hero">
        <Logo size={88} />
        <h1>{APP_NAME}</h1>
        <p className="muted">Версия {info?.version ?? '…'}</p>
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
    </div>
  );
}
