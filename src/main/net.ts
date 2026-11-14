/** Why a request failed; callers turn it into words about their own server. */
export type NetFailure = 'offline' | 'timeout' | 'status' | 'size' | 'json';

export class NetError extends Error {
  constructor(readonly kind: NetFailure, readonly status: number | null = null) {
    super(status === null ? `Request failed: ${kind}` : `Request failed: ${kind} ${status}`);
  }
}

export interface JsonOptions {
  headers?: Record<string, string>;
  /** For one attempt, in milliseconds. */
  timeout?: number;
  maxBytes?: number;
  /** Extra attempts after a failure that may pass by itself. */
  retries?: number;
  /** Pause before the first retry, in milliseconds; each next one is three times longer. */
  pause?: number;
}

const TIMEOUT = 20_000;
const MAX_BYTES = 4 * 1024 * 1024;
const RETRIES = 2;
const PAUSE = 1000;

/**
 * A dropped connection, a busy or broken server: the same request may well pass in a second.
 * A request that waited out its whole timeout is not worth waiting for again.
 */
function passing(error: unknown): boolean {
  if (!(error instanceof NetError)) return false;
  if (error.kind === 'offline') return true;
  return error.kind === 'status' && error.status !== null && (error.status >= 500 || error.status === 429);
}

async function attempt(url: string, options: JsonOptions): Promise<unknown> {
  const maxBytes = options.maxBytes ?? MAX_BYTES;
  let buffer: ArrayBuffer;
  try {
    const response = await fetch(url, { headers: options.headers, signal: AbortSignal.timeout(options.timeout ?? TIMEOUT) });
    if (!response.ok) {
      void response.body?.cancel().catch(() => undefined);
      throw new NetError('status', response.status);
    }
    // Do not even download a body the server already says is oversized.
    if (Number(response.headers.get('content-length')) > maxBytes) {
      void response.body?.cancel().catch(() => undefined);
      throw new NetError('size');
    }
    buffer = await response.arrayBuffer();
  } catch (error) {
    if (error instanceof NetError) throw error;
    throw new NetError(error instanceof Error && error.name === 'TimeoutError' ? 'timeout' : 'offline');
  }
  if (buffer.byteLength > maxBytes) throw new NetError('size');
  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    throw new NetError('json');
  }
}

/**
 * GETs JSON with a timeout and a size limit, trying again after failures that may pass.
 * Throws `NetError`.
 */
export async function getJson(url: string, options: JsonOptions = {}): Promise<unknown> {
  const retries = options.retries ?? RETRIES;
  let pause = options.pause ?? PAUSE;
  for (let left = retries; ; left -= 1) {
    try {
      return await attempt(url, options);
    } catch (error) {
      if (left <= 0 || !passing(error)) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, pause));
    pause *= 3;
  }
}
