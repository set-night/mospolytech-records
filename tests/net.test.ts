import { describe, expect, it } from 'vitest';
import { getJson, NetError } from '../src/main/net';
import { json, serve } from './http';

async function failure(promise: Promise<unknown>): Promise<NetError> {
  const error: unknown = await promise.then(() => null, (reason: unknown) => reason);
  if (!(error instanceof NetError)) throw new Error(`Expected a NetError, got ${String(error)}`);
  return error;
}

describe('getJson', () => {
  it('returns the parsed body and sends the headers', async () => {
    const { url, hits } = await serve((request, response) => json(response, { referer: request.headers.referer }));
    expect(await getJson(url, { headers: { Referer: 'https://example.test/' } })).toEqual({ referer: 'https://example.test/' });
    expect(hits()).toBe(1);
  });

  it('tries again after a server error', async () => {
    const { url, hits } = await serve((_request, response, attempt) => {
      if (attempt < 3) json(response, { error: 'busy' }, 503);
      else json(response, { ok: true });
    });
    expect(await getJson(url, { pause: 1 })).toEqual({ ok: true });
    expect(hits()).toBe(3);
  });

  it('tries again after a dropped connection', async () => {
    const { url, hits } = await serve((request, response, attempt) => {
      if (attempt === 1) request.socket.destroy();
      else json(response, { ok: true });
    });
    expect(await getJson(url, { pause: 1 })).toEqual({ ok: true });
    expect(hits()).toBe(2);
  });

  it('tries again when asked to slow down', async () => {
    const { url, hits } = await serve((_request, response, attempt) => {
      if (attempt === 1) json(response, {}, 429);
      else json(response, { ok: true });
    });
    expect(await getJson(url, { pause: 1 })).toEqual({ ok: true });
    expect(hits()).toBe(2);
  });

  it('gives up after the last retry and reports the status', async () => {
    const { url, hits } = await serve((_request, response) => json(response, {}, 502));
    const error = await failure(getJson(url, { pause: 1, retries: 2 }));
    expect(error.kind).toBe('status');
    expect(error.status).toBe(502);
    expect(hits()).toBe(3);
  });

  it('does not repeat a request the server refused', async () => {
    const { url, hits } = await serve((_request, response) => json(response, {}, 404));
    const error = await failure(getJson(url, { pause: 1 }));
    expect(error.kind).toBe('status');
    expect(error.status).toBe(404);
    expect(hits()).toBe(1);
  });

  it('refuses an oversized body, announced or not', async () => {
    const big = 'x'.repeat(5000);
    const announced = await serve((_request, response) => json(response, { big }));
    expect((await failure(getJson(announced.url, { maxBytes: 1000 }))).kind).toBe('size');

    const chunked = await serve((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.write('{"big":"');
      response.end(`${big}"}`);
    });
    expect((await failure(getJson(chunked.url, { maxBytes: 1000 }))).kind).toBe('size');
    expect(chunked.hits()).toBe(1);
  });

  it('reports a body that is not JSON without asking again', async () => {
    const { url, hits } = await serve((_request, response) => response.end('<html>'));
    expect((await failure(getJson(url, { pause: 1 }))).kind).toBe('json');
    expect(hits()).toBe(1);
  });

  it('gives up on a server that does not answer in time, once', async () => {
    const { url, hits } = await serve(() => {
      // Never answers.
    });
    const error = await failure(getJson(url, { timeout: 100, pause: 1 }));
    expect(error.kind).toBe('timeout');
    expect(hits()).toBe(1);
  });

  it('reports a server that is not there', async () => {
    const { url, close } = await serve((_request, response) => json(response, {}));
    await close();
    expect((await failure(getJson(url, { pause: 1, retries: 1 }))).kind).toBe('offline');
  });
});
