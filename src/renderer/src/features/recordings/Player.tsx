import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { mediaUrl } from '@shared/api';
import type { Recording } from '@shared/types';
import { Button } from '../../shared/ui';

export function Player({ recording, onClose }: { recording: Recording; onClose: () => void }) {
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal" role="dialog" aria-modal="true" aria-label={recording.subject} onClick={onClose}>
      <div className="player" onClick={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>{recording.subject}</h2>
            <p className="muted small">{[recording.date, recording.type, recording.teacher].filter(Boolean).join(' · ')}</p>
          </div>
          <Button variant="ghost" icon={<X size={18} />} aria-label="Закрыть" onClick={onClose} />
        </header>
        {failed ? (
          <div className="player-error">
            <p>Этот файл не получается показать внутри приложения.</p>
            <Button variant="primary" onClick={() => void window.api.openExternalPlayer(recording.file)}>Открыть в системном плеере</Button>
          </div>
        ) : (
          <video src={mediaUrl(recording.file)} controls autoPlay onError={() => setFailed(true)} />
        )}
      </div>
    </div>
  );
}
