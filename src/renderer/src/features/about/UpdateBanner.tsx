import { Download, RefreshCw } from 'lucide-react';
import type { RecorderStatus, UpdateInfo } from '@shared/types';
import { useAction } from '../../shared/hooks';
import { Button, ErrorText } from '../../shared/ui';

/** New version notice: a download link, download progress or a restart button. */
export function UpdateBanner({ update, status }: { update: UpdateInfo; status: RecorderStatus | null }) {
  const install = useAction(() => window.api.installUpdate());
  const busy = status !== null && status.state !== 'idle';

  if (update.stage === 'downloading') {
    return (
      <div className="update-banner">
        <Download size={20} />
        <div>
          <strong>Скачиваю версию {update.latest}</strong>
          <span className="muted small">Это происходит в фоне, запись не помешает.</span>
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
          <strong>Версия {update.latest} готова</strong>
          <span className="muted small">
            {busy ? 'Идёт пара — обновлю, когда она закончится и ты закроешь приложение.' : 'Перезапусти приложение — займёт пару секунд, записи и настройки останутся.'}
          </span>
          <ErrorText>{install.error}</ErrorText>
        </div>
        <Button variant="primary" disabled={busy || install.busy} onClick={() => void install.run()}>Перезапустить</Button>
      </div>
    );
  }

  return (
    <div className="update-banner">
      <Download size={20} />
      <div>
        <strong>Вышла версия {update.latest}</strong>
        <span className="muted small">У тебя {update.current}. Скачай установщик и запусти его поверх — записи и настройки сохранятся.</span>
      </div>
      <Button variant="primary" onClick={() => window.open(update.url)}>Скачать</Button>
    </div>
  );
}
