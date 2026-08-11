import { createServer, type IncomingMessage } from 'node:http';

import type { AddressInfo } from 'node:net';

export interface RecordedProxyRequest {
  method: string;
  url: string;
  status: number;
  /** Response body, truncated to a few KB — enough to eyeball, not to hold a large page. */
  bodySnippet: string;
}

export interface RecordingProxy {
  /** Hand this to the PRODUCER's `<PILLAR>_SELF_BASE_URL` so the registry advertises the proxy. */
  readonly baseUrl: string;
  readonly requests: readonly RecordedProxyRequest[];
  stop(): Promise<void>;
}

const BODY_SNIPPET_MAX_CHARS = 4_000;
const HOP_BY_HOP_REQUEST_HEADERS = new Set(['host', 'connection', 'content-length']);

/**
 * A transparent recording reverse proxy in front of `targetBaseUrl`.
 *
 * A live-seam test that boots the CONSUMER as its own OS process (see
 * `process-harness.ts`'s `spawnPillarProcess`) has no way to observe the
 * wire request that process's own `pillar()` call makes — it happens
 * inside a different process's `fetch`, not this one's. Registering this
 * proxy's `baseUrl` as the producer's `<PILLAR>_SELF_BASE_URL` makes the
 * registry hand the consumer this address instead of the producer's real
 * one; every request is forwarded to the real producer unchanged and its
 * outcome recorded, so the producer still does the real work — this only
 * adds an observer.
 */
export async function startRecordingProxy(targetBaseUrl: string): Promise<RecordingProxy> {
  const requests: RecordedProxyRequest[] = [];

  const server = createServer((req, res) => {
    void forwardAndRecord(req, targetBaseUrl, requests)
      .then(({ status, headers, bodyBuffer }) => {
        res.writeHead(status, Object.fromEntries(headers));
        res.end(bodyBuffer);
      })
      .catch((err: unknown) => {
        res.writeHead(502, { 'content-type': 'text/plain' });
        res.end(
          `recording proxy forward failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
  });

  const port = await new Promise<number>((resolve, reject) => {
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      resolve((server.address() as AddressInfo).port);
    });
  });

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    requests,
    stop: () =>
      new Promise((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()));
      }),
  };
}

async function forwardAndRecord(
  req: IncomingMessage,
  targetBaseUrl: string,
  requests: RecordedProxyRequest[]
): Promise<{ status: number; headers: Headers; bodyBuffer: Buffer }> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const requestBody = Buffer.concat(chunks);
  const method = req.method ?? 'GET';
  const url = `${targetBaseUrl}${req.url ?? ''}`;

  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: requestBody.length > 0 ? requestBody : undefined,
  });
  const bodyBuffer = Buffer.from(await response.arrayBuffer());

  requests.push({
    method,
    url,
    status: response.status,
    bodySnippet: bodyBuffer.toString('utf8').slice(0, BODY_SNIPPET_MAX_CHARS),
  });

  return { status: response.status, headers: response.headers, bodyBuffer };
}
