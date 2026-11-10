import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { protocol } from 'electron';
import { MEDIA_SCHEME } from '@shared/api';
import { insideFolder } from './recordings/library';

const TYPES: Record<string, string> = { mp4: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska' };

/** Must run before `app.ready`: the player needs seeking (Range) and streaming. */
export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  ]);
}

/**
 * The inclusive byte range a `Range` header asks for in a file of `size` bytes:
 * `null` to send the whole file, `'unsatisfiable'` for a range outside it.
 */
export function byteRange(header: string | null, size: number): { start: number; end: number } | 'unsatisfiable' | null {
  const range = /^bytes=(\d*)-(\d*)$/.exec(header?.trim() ?? '');
  if (!range || (!range[1] && !range[2]) || size === 0) return null;
  // `bytes=-500` is the last 500 bytes.
  const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
  const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  return start >= size || start > end ? 'unsatisfiable' : { start, end };
}

/** The file a `media://recording/<file>` URL points to, if it is a recording in `folder`. */
export function mediaFile(folder: string, requestUrl: string): string | null {
  try {
    const url = new URL(requestUrl);
    return url.hostname === 'recording' ? insideFolder(folder, decodeURIComponent(url.pathname.slice(1))) : null;
  } catch {
    // Not a URL or a broken percent-escape.
    return null;
  }
}

/** Serves `media://recording/<file>` from the recordings folder only. */
export function handleMedia(folder: () => string): void {
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const path = mediaFile(folder(), request.url);
    if (!path) return new Response('Forbidden', { status: 403 });
    const info = await stat(path).catch(() => null);
    if (!info?.isFile()) return new Response('Not found', { status: 404 });
    const size = info.size;
    const type = TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
    const range = byteRange(request.headers.get('range'), size);
    if (range === 'unsatisfiable') return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    if (!range) {
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
      return new Response(body, { headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } });
    }
    const body = Readable.toWeb(createReadStream(path, range)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 206,
      headers: {
        'content-type': type,
        'content-length': String(range.end - range.start + 1),
        'content-range': `bytes ${range.start}-${range.end}/${size}`,
        'accept-ranges': 'bytes',
      },
    });
  });
}
