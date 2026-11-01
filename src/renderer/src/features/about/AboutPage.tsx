import { useEffect, useState } from 'react';
import { Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { APP_NAME, type AppInfo, type UpdateInfo } from '@shared/types';
import { Button, Logo } from '../../shared/ui';

export function AboutPage({ update }: { update: UpdateInfo | null }) {
  const [info, setInfo] = useState<AppInfo | null>(null);
  useEffect(() => {
    void window.api.getInfo().then(setInfo);
  }, []);

  return (
    <div className="page about">
      {update && (
        <div className="update-banner">
          <Download size={20} />
          <div>
            <strong>Вышла версия {update.latest}</strong>
            <span className="muted small">У тебя {update.current}. Скачай установщик и запусти его поверх — записи и настройки сохранятся.</span>
          </div>
          <Button variant="primary" onClick={() => void window.api.openRepo()}>Скачать</Button>
        </div>
      )}
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
        </div>
        <p className="muted small about-note">
          <ShieldCheck size={14} /> Открытый код под лицензией MIT. Нашёл ошибку или есть идея — открой issue на GitHub.
        </p>
      </div>
    </div>
  );
}
