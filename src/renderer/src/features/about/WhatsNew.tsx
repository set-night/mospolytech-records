import { Sparkles } from 'lucide-react';
import type { UpdateState } from '@shared/types';
import { Button } from '../../shared/ui';
import { ReleaseNotes } from './ReleaseNotes';

/** Shown once after an update: what came with the version now running. */
export function WhatsNew({ update }: { update: UpdateState | null }) {
  if (!update?.whatsNew?.length) return null;
  return (
    <section className="whats-new">
      <div className="whats-new-head">
        <Sparkles size={18} />
        <strong>Обновлено до версии {update.current}</strong>
        <Button variant="ghost" onClick={() => void window.api.dismissWhatsNew()}>Понятно</Button>
      </div>
      <ReleaseNotes sections={update.whatsNew} />
    </section>
  );
}
