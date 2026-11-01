import { createReadStream, statSync } from 'node:fs';
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

/** Serves `media://recording/<file>` from the recordings folder only. */
export function handleMedia(folder: () => string): void {
  protocol.handle(MEDIA_SCHEME, (request) => {
    const url = new URL(request.url);
    const path = url.hostname === 'recording' ? insideFolder(folder(), decodeURIComponent(url.pathname.slice(1))) : null;
    if (!path) return new Response('Forbidden', { status: 403 });
    let size: number;
    try {
      size = statSync(path).size;
    } catch {
      return new Response('Not found', { status: 404 });
    }
    const type = TYPES[path.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream';
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') ?? '');
    if (!range || size === 0) {
      const body = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;
      return new Response(body, { headers: { 'content-type': type, 'content-length': String(size), 'accept-ranges': 'bytes' } });
    }
    const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    if (start >= size || start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const body = Readable.toWeb(createReadStream(path, { start, end })) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 206,
      headers: {
        'content-type': type,
        'content-length': String(end - start + 1),
        'content-range': `bytes ${start}-${end}/${size}`,
        'accept-ranges': 'bytes',
      },
    });
  });
}
