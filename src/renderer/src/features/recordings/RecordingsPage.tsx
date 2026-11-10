import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Film, FolderOpen, Search } from 'lucide-react';
import { errorText } from '@shared/errors';
import { subjectKey } from '@shared/subject';
import type { Recording } from '@shared/types';
import { capitalize, dayTitle, fileSize, plural } from '../../shared/format';
import { useAction, useEvent } from '../../shared/hooks';
import { Button, Empty, ErrorText, PageHeader } from '../../shared/ui';
import { Player } from './Player';
import { RecordingCard } from './RecordingCard';

export function RecordingsPage({ folder }: { folder: string }) {
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [query, setQuery] = useState('');
  const [playingFile, setPlayingFile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openFolder = useAction(() => window.api.openFolder());

  const request = useRef(0);
  const load = useCallback(() => {
    // Events can come in bursts: only the latest answer is shown.
    const id = request.current += 1;
    window.api.listRecordings().then(
      (list) => {
        if (id !== request.current) return;
        setRecordings(list);
        setError(null);
      },
      (caught: unknown) => {
        if (id === request.current) setError(errorText(caught));
      },
    );
  }, []);
  // Of all settings only the folder changes what is listed here.
  useEffect(load, [load, folder]);
  useEvent('recordings', load);

  const groups = useMemo(() => {
    const needle = subjectKey(query);
    const map = new Map<string, Recording[]>();
    for (const recording of recordings ?? []) {
      if (needle && !subjectKey(`${recording.subject} ${recording.teacher} ${recording.type}`).includes(needle)) continue;
      const day = map.get(recording.date);
      if (day) day.push(recording);
      else map.set(recording.date, [recording]);
    }
    return [...map.entries()];
  }, [recordings, query]);

  const total = useMemo(() => recordings?.reduce((sum, item) => sum + item.size, 0) ?? 0, [recordings]);
  const count = recordings?.length ?? 0;
  // Looked up by file, so the player closes by itself when its recording is trashed.
  const playing = playingFile ? recordings?.find((item) => item.file === playingFile) ?? null : null;
  const closePlayer = useCallback(() => setPlayingFile(null), []);

  return (
    <div className="page">
      <PageHeader
        title="Записи"
        subtitle={count ? `${count} ${plural(count, 'запись', 'записи', 'записей')} · ${fileSize(total)}` : undefined}
        actions={<Button icon={<FolderOpen size={16} />} onClick={() => void openFolder.run()}>Открыть папку</Button>}
      />
      <ErrorText>{error ?? openFolder.error}</ErrorText>
      {count > 0 && (
        <label className="search">
          <Search size={16} />
          <input value={query} placeholder="Найти по предмету или преподавателю" onChange={(event) => setQuery(event.target.value)} />
        </label>
      )}
      {recordings && !count && (
        <Empty icon={<Film size={28} />} title="Записей пока нет">
          Как только начнётся пара с вебинаром, запись появится здесь.
        </Empty>
      )}
      {groups.map(([date, items]) => (
        <section key={date} className="section">
          <h2 className="date-title">{capitalize(dayTitle(date))}</h2>
          <div className="recording-grid">
            {items.map((recording) => (
              <RecordingCard key={recording.file} recording={recording} onPlay={() => setPlayingFile(recording.file)} onChanged={load} />
            ))}
          </div>
        </section>
      ))}
      {recordings && count > 0 && !groups.length && <p className="muted">По запросу «{query.trim()}» ничего не нашлось.</p>}
      {playing && <Player key={playing.file} recording={playing} onClose={closePlayer} />}
    </div>
  );
}
