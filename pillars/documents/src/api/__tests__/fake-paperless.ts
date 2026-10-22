/**
 * A fake Paperless-ngx 3.2.1 on a real loopback port, for the suites that
 * drive the documents routes end to end. It answers the endpoints the
 * client calls with the shapes 3.2.1 returns, and records what it was sent.
 *
 * Like Django's `FileResponse`, downloads ignore `Range` unless
 * `honourRange` is set.
 */
import { once } from 'node:events';
import http from 'node:http';

import type { IncomingMessage, ServerResponse } from 'node:http';

export interface FakeDocument {
  bytes: Buffer;
  mimeType: string;
  fileName: string;
  title: string;
}

export interface FakeUpload {
  readonly fields: Record<string, string>;
  readonly fileName: string;
  readonly fileType: string;
  readonly bytes: Buffer;
}

export interface FakeRequest {
  readonly method: string;
  readonly url: string;
  readonly headers: http.IncomingHttpHeaders;
  readonly body: string;
}

export interface FakePaperless {
  readonly url: string;
  readonly uploads: FakeUpload[];
  readonly requests: FakeRequest[];
  readonly tasks: Map<string, { status: string; result_data: Record<string, unknown> | null }>;
  readonly documents: Map<number, FakeDocument>;
  /** Every response's status when set, as if Paperless were failing. */
  failWith: number | null;
  honourRange: boolean;
  close(): Promise<void>;
}

async function readBody(req: IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    if (chunk instanceof Buffer) chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function json(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
}

function rawDocument(id: number, doc: FakeDocument): Record<string, unknown> {
  return {
    id,
    correspondent: null,
    document_type: null,
    title: doc.title,
    content: '',
    tags: [],
    created: '2026-10-01T00:00:00Z',
    created_date: '2026-10-01',
    modified: '2026-10-01T00:00:00Z',
    added: '2026-10-01T00:00:00Z',
    archive_serial_number: null,
    original_file_name: doc.fileName,
    archived_file_name: null,
    notes: [],
  };
}

async function recordUpload(
  fake: FakePaperless,
  req: IncomingMessage,
  body: Buffer
): Promise<string> {
  const form = await new Response(new Uint8Array(body), {
    headers: { 'content-type': req.headers['content-type'] ?? '' },
  }).formData();
  const fields: Record<string, string> = {};
  let file: File | null = null;
  for (const [name, value] of form.entries()) {
    if (typeof value === 'string') fields[name] = value;
    else if (name === 'document') file = value;
  }
  if (file === null) throw new Error('fake paperless: upload carried no document field');
  fake.uploads.push({
    fields,
    fileName: file.name,
    fileType: file.type,
    bytes: Buffer.from(await file.arrayBuffer()),
  });
  return `task-${fake.uploads.length}`;
}

function download(
  fake: FakePaperless,
  req: IncomingMessage,
  res: ServerResponse,
  doc: FakeDocument
): void {
  const headers = {
    'content-type': doc.mimeType,
    'content-disposition': `attachment; filename="${doc.fileName}"`,
  };
  const range = /^bytes=(\d+)-(\d+)$/.exec(req.headers.range ?? '');
  if (fake.honourRange && range !== null) {
    const start = Number(range[1]);
    const end = Number(range[2]);
    const slice = doc.bytes.subarray(start, end + 1);
    res.writeHead(206, {
      ...headers,
      'content-length': String(slice.length),
      'content-range': `bytes ${start}-${end}/${doc.bytes.length}`,
    });
    res.end(slice);
    return;
  }
  res.writeHead(200, { ...headers, 'content-length': String(doc.bytes.length) }).end(doc.bytes);
}

function applyPatch(doc: FakeDocument, body: Buffer): void {
  const patch: unknown = JSON.parse(body.toString('utf8'));
  if (typeof patch !== 'object' || patch === null || !('title' in patch)) return;
  if (typeof patch.title === 'string') doc.title = patch.title;
}

function documentRoute(
  fake: FakePaperless,
  req: IncomingMessage,
  res: ServerResponse,
  body: Buffer
): void {
  const match = /^\/api\/documents\/(\d+)\/(download\/)?/.exec(req.url ?? '');
  const id = Number(match?.[1]);
  const doc = fake.documents.get(id);
  if (match === null || doc === undefined) {
    json(res, 404, { detail: 'No Document matches the given query.' });
    return;
  }
  if (match[2] !== undefined && req.method === 'GET') {
    download(fake, req, res, doc);
    return;
  }
  if (req.method === 'PATCH') {
    applyPatch(doc, body);
    json(res, 200, rawDocument(id, doc));
    return;
  }
  if (req.method === 'DELETE') {
    fake.documents.delete(id);
    res.writeHead(204).end();
    return;
  }
  json(res, 405, { detail: 'Method not allowed.' });
}

async function route(
  fake: FakePaperless,
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const body = await readBody(req);
  const url = new URL(req.url ?? '/', 'http://fake');
  fake.requests.push({
    method: req.method ?? '',
    url: req.url ?? '',
    headers: req.headers,
    body: body.toString('utf8'),
  });
  if (fake.failWith !== null) return json(res, fake.failWith, { detail: 'fake failure' });
  if (req.method === 'POST' && url.pathname === '/api/documents/post_document/') {
    // Paperless runs under a WSGI server that reads a request body only up to
    // its declared Content-Length, so a chunked upload reaches Django empty.
    if (req.headers['content-length'] === undefined) {
      return json(res, 400, { document: ['No file was submitted.'] });
    }
    return json(res, 200, await recordUpload(fake, req, body));
  }
  if (req.method === 'GET' && url.pathname === '/api/tasks/') {
    const taskId = url.searchParams.get('task_id') ?? '';
    const task = fake.tasks.get(taskId);
    const results = task === undefined ? [] : [{ id: 1, task_id: taskId, ...task }];
    return json(res, 200, { count: results.length, next: null, previous: null, results });
  }
  documentRoute(fake, req, res, body);
}

/** Start a fake Paperless on `127.0.0.1` and an ephemeral port. */
export async function startFakePaperless(): Promise<FakePaperless> {
  const server = http.createServer();
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('fake paperless: no port');
  const fake: FakePaperless = {
    url: `http://127.0.0.1:${address.port}`,
    uploads: [],
    requests: [],
    tasks: new Map(),
    documents: new Map(),
    failWith: null,
    honourRange: false,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  server.on('request', (req: IncomingMessage, res: ServerResponse) => {
    route(fake, req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
  });
  return fake;
}
