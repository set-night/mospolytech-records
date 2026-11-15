import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach } from 'vitest';

export type Handler = (request: IncomingMessage, response: ServerResponse, attempt: number) => void;

const running = new Set<Server>();

afterEach(async () => {
  const servers = [...running];
  running.clear();
  await Promise.all(servers.map((server) => {
    server.closeAllConnections();
    return new Promise((resolve) => server.close(resolve));
  }));
});

/** A real HTTP server on a free local port, closed after the test; returns its address, how many requests it got and a way to stop it early. */
export async function serve(handler: Handler): Promise<{ url: string; hits: () => number; close: () => Promise<void> }> {
  let hits = 0;
  const server = createServer((request, response) => {
    hits += 1;
    handler(request, response, hits);
  });
  running.add(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  const close = async (): Promise<void> => {
    running.delete(server);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  };
  return { url: `http://127.0.0.1:${port}/`, hits: () => hits, close };
}

export function json(response: ServerResponse, body: unknown, status = 200): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}
