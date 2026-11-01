import type { UpdateInfo } from '@shared/types';
import { REPO_URL } from '@shared/types';

const API = REPO_URL.replace('https://github.com/', 'https://api.github.com/repos/') + '/releases/latest';

function parts(version: string): number[] {
  return version.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  for (let index = 0; index < 3; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff) return diff > 0;
  }
  return false;
}

/** Looks at the latest GitHub release; installers are downloaded by the user from the page. */
export async function checkUpdates(current: string): Promise<UpdateInfo | null> {
  const response = await fetch(API, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'mospolytech-records' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { tag_name?: unknown; html_url?: unknown };
  if (typeof body.tag_name !== 'string' || typeof body.html_url !== 'string') return null;
  return isNewer(body.tag_name, current) ? { current, latest: body.tag_name.replace(/^v/, ''), url: body.html_url } : null;
}
