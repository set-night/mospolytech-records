import { z } from 'zod';
import { REPO_URL, type ReleaseSection } from '@shared/types';
import { getJson, NetError } from '../net';

/** How this copy of the app was installed; decides which file is its next version. */
export type InstallKind = 'nsis' | 'msi' | 'appimage' | 'deb' | 'dmg' | 'dev';

export interface ReleaseAsset {
  name: string;
  url: string;
}

export interface Release {
  /** Without the leading `v`. */
  version: string;
  notes: ReleaseSection[];
  assets: ReleaseAsset[];
}

const API = REPO_URL.replace('https://github.com/', 'https://api.github.com/repos/');
const DOWNLOADS = `${REPO_URL}/releases/download/`;
const MAX_ITEMS = 30;
const MAX_ITEM = 300;

function parts(version: string): number[] {
  return version.replace(/^v/, '').split(/[.-]/).slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
}

export function isNewer(latest: string, current: string): boolean {
  const a = parts(latest);
  const b = parts(current);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return false;
}

export function releasePage(version: string): string {
  return `${REPO_URL}/releases/tag/v${version}`;
}

/** The changelog part of a release starts under one of these; any other `##` heading ends it. */
const CHANGELOG = /^##\s+(\[?v?\d|что нового)/i;
/** `([#9](…)) ([e4bd25d](…))`: where a change came from, of no use to the user. */
const SOURCE = /(\s*\(\[[^\]]+\]\([^)]+\)\))+\s*$/;

function clean(item: string): string {
  const text = item
    .replace(SOURCE, '')
    .replace(/^\*\*[^*]+:\*\*\s*/, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*|`/g, '')
    .trim();
  const short = text.length > MAX_ITEM ? `${text.slice(0, MAX_ITEM - 1).trimEnd()}…` : text;
  return short.charAt(0).toUpperCase() + short.slice(1);
}

/**
 * The changes of a release as plain text, from the markdown release-please writes:
 * `### Heading` and a list under it. The download table and other sections are skipped.
 */
export function parseNotes(body: string): ReleaseSection[] {
  const sections: ReleaseSection[] = [];
  let current: ReleaseSection | null = null;
  let inside = true;
  let left = MAX_ITEMS;
  for (const line of body.split(/\r?\n/)) {
    if (/^##\s/.test(line)) {
      inside = CHANGELOG.test(line);
      current = null;
      continue;
    }
    if (!inside) continue;
    const heading = /^###\s+(.+)$/.exec(line);
    if (heading?.[1]) {
      current = { title: clean(heading[1]), items: [] };
      sections.push(current);
      continue;
    }
    const item = /^[*-]\s+(.+)$/.exec(line);
    if (!item?.[1] || left <= 0) continue;
    const text = clean(item[1]);
    if (!text) continue;
    if (!current) {
      current = { title: 'Изменения', items: [] };
      sections.push(current);
    }
    current.items.push(text);
    left -= 1;
  }
  return sections.filter((section) => section.items.length > 0);
}

/** File names as `electron-builder.yml` gives them; they carry no version. */
export function installerName(kind: InstallKind, arch: string): string | null {
  switch (kind) {
    case 'nsis': return 'MosPolytech-Records-Setup-x64.exe';
    case 'msi': return 'MosPolytech-Records-x64.msi';
    case 'appimage': return 'MosPolytech-Records-x86_64.AppImage';
    case 'deb': return 'MosPolytech-Records-amd64.deb';
    case 'dmg': return `MosPolytech-Records-${arch === 'arm64' ? 'arm64' : 'x64'}.dmg`;
    default: return null;
  }
}

/** Where to download the installer of this build from; `null` while the release has none (yet). */
export function installerFor(kind: InstallKind, arch: string, assets: ReleaseAsset[]): string | null {
  const name = installerName(kind, arch);
  if (!name) return null;
  const asset = assets.find((candidate) => candidate.name === name);
  // The link is opened in the browser: it may only lead to our own releases.
  return asset?.url.startsWith(DOWNLOADS) ? asset.url : null;
}

const releaseSchema = z.object({
  tag_name: z.string().regex(/^v?\d+\.\d+\.\d+/).max(40),
  body: z.string().nullish(),
  assets: z.array(z.object({ name: z.string().max(200), browser_download_url: z.string().max(1000) })).max(100).catch([]),
});

/**
 * The latest published release, or the one of `version`; `null` when there is none.
 * Throws `NetError`.
 */
export async function fetchRelease(version?: string, api: string = API): Promise<Release | null> {
  const url = version ? `${api}/releases/tags/v${encodeURIComponent(version)}` : `${api}/releases/latest`;
  let raw: unknown;
  try {
    raw = await getJson(url, {
      headers: { accept: 'application/vnd.github+json', 'user-agent': 'mospolytech-records' },
      maxBytes: 1024 * 1024,
    });
  } catch (error) {
    if (error instanceof NetError && error.kind === 'status' && error.status === 404) return null;
    throw error;
  }
  const parsed = releaseSchema.safeParse(raw);
  if (!parsed.success) throw new NetError('json');
  return {
    version: parsed.data.tag_name.replace(/^v/, ''),
    notes: parseNotes(parsed.data.body ?? ''),
    assets: parsed.data.assets.map((asset) => ({ name: asset.name, url: asset.browser_download_url })),
  };
}
