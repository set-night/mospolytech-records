import { useState } from 'react';
import { ExternalLink, FolderSearch, Play, Trash2 } from 'lucide-react';
import type { Recording } from '@shared/types';
import { fileSize } from '../../shared/format';
import { useAction } from '../../shared/hooks';
import { Badge, Button, ErrorText } from '../../shared/ui';

export function RecordingCard({ recording, onPlay, onChanged }: { recording: Recording; onPlay: () => void; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const trash = useAction(async () => {
    await window.api.trashRecording(recording.file);
    onChanged();
  });
  const show = useAction(() => window.api.showRecording(recording.file));
  const external = useAction(() => window.api.openExternalPlayer(recording.file));
  const live = recording.status === 'recording';

  return (
    <article className="recording">
      <button type="button" className="recording-thumb" onClick={onPlay} disabled={live} aria-label={`Смотреть «${recording.subject}»`}>
        <Play size={26} />
        <span className="recording-time">{recording.startTime}{recording.endTime && `–${recording.endTime}`}</span>
      </button>
      <div className="recording-body">
        <div className="recording-title">
          <h3 title={recording.name}>{recording.subject}</h3>
          {live && <Badge tone="live">Пишется</Badge>}
          {recording.status === 'partial' && <Badge tone="warn" >Неполная</Badge>}
        </div>
        <p className="recording-meta">
          <span>{[recording.type, recording.teacher].filter(Boolean).join(' · ')}</span>
          <span>{fileSize(recording.size)}</span>
        </p>
        {recording.note && <p className="muted small">{recording.note}</p>}
        <div className="recording-actions">
          <Button variant="ghost" icon={<FolderSearch size={15} />} title="Показать в папке" onClick={() => void show.run()} />
          <Button variant="ghost" icon={<ExternalLink size={15} />} title="Открыть в другом плеере" onClick={() => void external.run()} />
          {!live && (confirming ? (
            <>
              <Button variant="danger" disabled={trash.busy} onClick={() => void trash.run()}>В корзину</Button>
              <Button variant="ghost" onClick={() => setConfirming(false)}>Отмена</Button>
            </>
          ) : (
            <Button variant="ghost" icon={<Trash2 size={15} />} title="Удалить в корзину" onClick={() => setConfirming(true)} />
          ))}
        </div>
        <ErrorText>{trash.error ?? show.error ?? external.error}</ErrorText>
      </div>
    </article>
  );
}
