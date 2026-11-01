import { useCallback, useEffect, useMemo, useState } from 'react';
import { Film, FolderOpen, Search } from 'lucide-react';
import type { Recording } from '@shared/types';
import { capitalize, dayTitle, fileSize, plural } from '../../shared/format';
import { errorText, useAction, useEvent } from '../../shared/hooks';
import { Button, Empty, ErrorText, PageHeader } from '../../shared/ui';
import { Player } from './Player';
import { RecordingCard } from './RecordingCard';

export function RecordingsPage() {
  const [recordings, setRecordings] = useState<Recording[] | null>(null);
  const [query, setQuery] = useState('');
  const [playing, setPlaying] = useState<Recording | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openFolder = useAction(() => window.api.openFolder());

  const load = useCallback(() => {
    window.api.listRecordings().then(setRecordings, (caught: unknown) => setError(errorText(caught)));
  }, []);
  useEffect(load, [load]);
  useEvent('recordings', load);
  useEvent('settings', load);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const map = new Map<string, Recording[]>();
    for (const recording of recordings ?? []) {
      if (needle && !`${recording.subject} ${recording.teacher} ${recording.type}`.toLowerCase().includes(needle)) continue;
      map.set(recording.date, [...(map.get(recording.date) ?? []), recording]);
    }
    return [...map.entries()];
  }, [recordings, query]);

  const total = recordings?.reduce((sum, item) => sum + item.size, 0) ?? 0;
  const count = recordings?.length ?? 0;

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
              <RecordingCard key={recording.file} recording={recording} onPlay={() => setPlaying(recording)} onChanged={load} />
            ))}
          </div>
        </section>
      ))}
      {playing && <Player recording={playing} onClose={() => setPlaying(null)} />}
    </div>
  );
}
