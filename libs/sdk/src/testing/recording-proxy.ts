import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';

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

const BODY_SNIPPET_MAX_BYTES = 4_000;
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
    void forwardAndRecord(req, res, targetBaseUrl, requests).catch((err: unknown) => {
      if (res.headersSent) {
        res.destroy(err instanceof Error ? err : new Error(String(err)));
        return;
      }
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

/**
 * Forwards `req` to `targetBaseUrl` and streams the upstream response
 * straight through to `res` — a producer that answered with a large body
 * is not buffered into memory just because a test happens to be watching.
 * Only the first {@link BODY_SNIPPET_MAX_BYTES} of the response are also
 * copied into `requests`, for a caller that wants to assert on the body.
 */
async function forwardAndRecord(
  req: IncomingMessage,
  res: ServerResponse,
  targetBaseUrl: string,
  requests: RecordedProxyRequest[]
): Promise<void> {
  const method = req.method ?? 'GET';
  const url = `${targetBaseUrl}${req.url ?? ''}`;
  const requestBody = await readBody(req);

  const response = await fetch(url, {
    method,
    headers: forwardableRequestHeaders(req),
    body: requestBody.length > 0 ? new Uint8Array(requestBody) : undefined,
  });
  res.writeHead(response.status, responseHeadersFor(response));
  const bodySnippet = await pipeWithSnippet(response, res);

  requests.push({ method, url, status: response.status, bodySnippet });
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks);
}

function forwardableRequestHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined || HOP_BY_HOP_REQUEST_HEADERS.has(key.toLowerCase())) continue;
    headers.set(key, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

/**
 * Streams `response`'s body to `res` chunk by chunk (never buffering the
 * whole thing) while also returning the first {@link BODY_SNIPPET_MAX_BYTES}
 * of it, for a caller that wants to assert on the body without holding a
 * large upstream payload in memory just because a test happens to be
 * watching.
 */
async function pipeWithSnippet(response: Response, res: ServerResponse): Promise<string> {
  const snippetChunks: Buffer[] = [];
  let snippetBytes = 0;
  const reader = response.body?.getReader();
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const buf = Buffer.from(value);
      res.write(buf);
      if (snippetBytes >= BODY_SNIPPET_MAX_BYTES) continue;
      const room = BODY_SNIPPET_MAX_BYTES - snippetBytes;
      snippetChunks.push(buf.subarray(0, room));
      snippetBytes += Math.min(buf.length, room);
    }
  }
  res.end();
  return Buffer.concat(snippetChunks).toString('utf8');
}

/**
 * Node's `res.writeHead` accepts a repeated header as a string array, which
 * is the only way to forward a multi-valued `set-cookie` without collapsing
 * it into one invalid combined value — `Object.fromEntries(response.headers)`
 * would do exactly that, since `Headers` iteration folds repeats into one
 * comma-joined entry for every header except `set-cookie`.
 */
function responseHeadersFor(response: Response): Record<string, string | string[]> {
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of response.headers) {
    if (key.toLowerCase() === 'set-cookie') continue;
    out[key] = value;
  }
  const setCookie = response.headers.getSetCookie();
  if (setCookie.length > 0) out['set-cookie'] = setCookie;
  return out;
}
