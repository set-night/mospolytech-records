import { Download, RefreshCw } from 'lucide-react';
import type { RecorderStatus, UpdateState } from '@shared/types';
import { useAction } from '../../shared/hooks';
import { Button, ErrorText } from '../../shared/ui';
import { isNews } from './update';

/** A new version: what is going on with it and the one button that moves it forward. */
export function UpdateBanner({ update, status }: { update: UpdateState | null; status: RecorderStatus | null }) {
  const download = useAction(() => window.api.downloadUpdate());
  const install = useAction(() => window.api.installUpdate());
  if (!isNews(update)) return null;
  const busy = status !== null && status.state !== 'idle';
  const version = update.latest;

  if (update.stage === 'downloading') {
    return (
      <div className="update-banner">
        <Download size={20} />
        <div>
          <strong>Скачиваю версию {version}</strong>
          <span className="muted small">Это происходит в фоне. Ничего делать не нужно.</span>
          <progress max={100} value={update.percent ?? 0} aria-label="Загрузка обновления" />
        </div>
      </div>
    );
  }

  if (update.stage === 'ready') {
    return (
      <div className="update-banner">
        <RefreshCw size={20} />
        <div>
          <strong>Версия {version} готова к установке</strong>
          <span className="muted small">
            {busy ? 'Идёт пара — обновлю после неё.' : 'Перезапусти приложение — займёт пару секунд, записи и настройки останутся.'}
          </span>
          <ErrorText>{install.error}</ErrorText>
        </div>
        <Button variant="primary" disabled={busy || install.busy} onClick={() => void install.run()}>Перезапустить</Button>
      </div>
    );
  }

  if (update.stage === 'available') {
    return (
      <div className="update-banner">
        <Download size={20} />
        <div>
          <strong>Вышла версия {version}</strong>
          <span className="muted small">
            {busy ? 'Скачаю, когда закончится пара — чтобы не мешать записи.' : `У тебя ${update.current}. Обновление скачается в фоне, а установится по твоей кнопке.`}
          </span>
          <ErrorText>{update.error ?? download.error}</ErrorText>
        </div>
        {!busy && <Button variant="primary" disabled={download.busy} onClick={() => void download.run()}>Скачать</Button>}
      </div>
    );
  }

  return (
    <div className="update-banner">
      <Download size={20} />
      <div>
        <strong>Вышла версия {version}</strong>
        <span className="muted small">У тебя {update.current}. Скачай установщик и запусти его — записи и настройки сохранятся.</span>
      </div>
      <Button variant="primary" onClick={() => window.open(update.url)}>Скачать установщик</Button>
    </div>
  );
}
