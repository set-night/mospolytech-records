import type { UpdateState } from '@shared/types';
import { ago } from '../../shared/format';

/** A new version is known: worth a banner and a dot in the sidebar. */
export function isNews(update: UpdateState | null): update is UpdateState & { latest: string } {
  if (!update?.latest) return false;
  return update.stage === 'available' || update.stage === 'downloading' || update.stage === 'ready' || update.stage === 'manual';
}

/** One line under the version: what the last check found. */
export function updateLine(update: UpdateState, now: number): string {
  switch (update.stage) {
    case 'checking':
      return 'Проверяю обновления…';
    case 'error':
      return update.error ?? 'Не удалось проверить обновления';
    case 'idle':
      return update.checkedAt === null
        ? 'Обновления ещё не проверялись'
        : `Установлена последняя версия · проверено ${ago(now - update.checkedAt)}`;
    default:
      return `Доступна версия ${update.latest ?? ''}`.trim();
  }
}
