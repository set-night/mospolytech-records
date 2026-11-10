import { useEffect, useState } from 'react';
import { CalendarDays, Film, Info, LayoutDashboard, Settings as SettingsIcon } from 'lucide-react';
import type { UpdateInfo } from '@shared/types';
import { AboutPage } from '../features/about/AboutPage';
import { Onboarding } from '../features/onboarding/Onboarding';
import { RecordingsPage } from '../features/recordings/RecordingsPage';
import { SchedulePage } from '../features/schedule/SchedulePage';
import { SettingsPage } from '../features/settings/SettingsPage';
import { HomePage } from '../features/status/HomePage';
import { useEvent, useSettings, useStatus } from '../shared/hooks';
import { Logo } from '../shared/ui';

const PAGES = [
  { id: 'status', label: 'Главная', icon: LayoutDashboard },
  { id: 'schedule', label: 'Расписание', icon: CalendarDays },
  { id: 'recordings', label: 'Записи', icon: Film },
  { id: 'settings', label: 'Настройки', icon: SettingsIcon },
  { id: 'about', label: 'О программе', icon: Info },
] as const;

type Page = (typeof PAGES)[number]['id'];

function pageFrom(value: string): Page {
  return PAGES.find((page) => page.id === value)?.id ?? 'status';
}

export function App() {
  const settings = useSettings();
  const status = useStatus();
  const [page, setPage] = useState<Page>(() => pageFrom(location.hash.slice(1)));
  const [update, setUpdate] = useState<UpdateInfo | null>(null);

  useEvent('navigate', (target) => setPage(pageFrom(target)));
  useEvent('update', setUpdate);
  useEffect(() => {
    // Offline at start is normal: the main process checks again later and pushes `update`.
    void window.api.checkUpdates().then((info) => info && setUpdate(info), () => undefined);
  }, []);

  if (!settings) return <div className="splash"><Logo size={56} /></div>;
  if (!settings.onboarded) return <Onboarding settings={settings} />;

  const live = status?.state === 'recording';
  return (
    <div className="layout">
      <nav className="sidebar">
        <div className="brand">
          <Logo />
          <div>
            <strong>MosPolytech</strong>
            <span>Records</span>
          </div>
        </div>
        <ul>
          {PAGES.map(({ id, label, icon: Icon }) => (
            <li key={id}>
              <button type="button" className={`nav-item ${page === id ? 'nav-active' : ''}`} title={label} onClick={() => setPage(id)}>
                <Icon size={18} />
                <span>{label}</span>
                {id === 'status' && live && <span className="live-dot" aria-label="Идёт запись" />}
                {id === 'about' && update && <span className="update-dot" aria-label="Есть обновление" />}
              </button>
            </li>
          ))}
        </ul>
        <div className="sidebar-foot">
          <span className="group-chip">Группа {settings.group}</span>
        </div>
      </nav>
      <main className="content">
        {page === 'status' && <HomePage settings={settings} status={status} update={update} onNavigate={setPage} />}
        {page === 'schedule' && <SchedulePage settings={settings} status={status} />}
        {page === 'recordings' && <RecordingsPage folder={settings.folder} />}
        {page === 'settings' && <SettingsPage settings={settings} />}
        {page === 'about' && <AboutPage update={update} status={status} />}
      </main>
    </div>
  );
}
