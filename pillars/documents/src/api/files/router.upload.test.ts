import { readdirSync } from 'node:fs';
/**
 * `POST /paperless/documents` end to end: the documents app in front of a
 * fake Paperless on a real port, so the streamed multipart body is parsed by
 * a real multipart parser and the cap is exercised over a real socket.
 */
import http from 'node:http';
import { tmpdir } from 'node:os';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startFakePaperless, type FakePaperless } from '../__tests__/fake-paperless.js';
import { createTestTransport } from '../__tests__/test-http.js';
import { unreachablePaperlessUrl } from '../__tests__/unreachable-url.js';
import { createDocumentsApiApp } from '../app.js';

const { requestOn } = createTestTransport();

let fake: FakePaperless;

function app() {
  return createDocumentsApiApp({ version: '0.0.1-test', selfBaseUrl: 'http://localhost:3012' });
}

function spoolDirs(): string[] {
  return readdirSync(tmpdir()).filter((name) => name.startsWith('documents-upload-'));
}

function upload(query: string, bytes: Buffer, contentType = 'application/pdf') {
  return requestOn(app())
    .post(`/paperless/documents${query}`)
    .set('content-type', contentType)
    .send(bytes);
}

/** A body with no Content-Length, sent in separate chunks, so only counting can catch it. */
async function chunkedUpload(
  chunks: readonly Buffer[]
): Promise<{ status: number; body: unknown }> {
  const server = http.createServer(app());
  server.listen(0, '127.0.0.1');
  await new Promise((resolve) => server.once('listening', resolve));
  const address = server.address();
  if (typeof address !== 'object' || address === null) throw new Error('no port');
  try {
    return await new Promise((resolve, reject) => {
      const req = http.request({
        host: '127.0.0.1',
        port: address.port,
        method: 'POST',
        path: '/paperless/documents?fileName=big.pdf',
        headers: { 'content-type': 'application/pdf', 'transfer-encoding': 'chunked' },
      });
      req.on('response', (res) => {
        const parts: Buffer[] = [];
        res.on('data', (chunk: Buffer) => parts.push(chunk));
        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            body: JSON.parse(Buffer.concat(parts).toString()),
          });
        });
      });
      req.on('error', reject);
      for (const chunk of chunks) req.write(chunk);
      req.end();
    });
  } finally {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}

beforeEach(async () => {
  fake = await startFakePaperless();
  vi.stubEnv('PAPERLESS_BASE_URL', fake.url);
  vi.stubEnv('PAPERLESS_API_TOKEN', 'test-token');
  vi.stubEnv('DOCUMENTS_MAX_UPLOAD_BYTES', '');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fake.close();
});

describe('POST /paperless/documents', () => {
  it('streams the bytes, file name, type and title to post_document and returns 202 with the task id', async () => {
    const bytes = Buffer.concat([
      Buffer.from('%PDF-1.7\r\n--not-a-boundary\r\n'),
      Buffer.from([0, 255, 13, 10]),
    ]);

    const res = await upload('?fileName=receipt%20%22a%22.pdf&title=Kettle%20receipt', bytes);

    expect(res.status).toBe(202);
    expect(res.body).toEqual({ data: { taskId: 'task-1' } });
    expect(fake.uploads).toHaveLength(1);
    const [received] = fake.uploads;
    expect(received?.bytes.equals(bytes)).toBe(true);
    expect(received?.fileType).toBe('application/pdf');
    expect(received?.fileName).toBe('receipt "a".pdf');
    expect(fake.requests[0]?.body).toContain('filename="receipt %22a%22.pdf"');
    expect(received?.fields).toEqual({ title: 'Kettle receipt' });
    expect(fake.requests[0]?.headers.authorization).toBe('Token test-token');
  });

  it('sends no title field when none is given, and forwards the MIME essence only', async () => {
    const res = await upload(
      '?fileName=note.txt',
      Buffer.from('hello'),
      'Text/Plain; charset=utf-8'
    );

    expect(res.status).toBe(202);
    expect(fake.uploads[0]?.fields).toEqual({});
    expect(fake.uploads[0]?.fileType).toBe('text/plain');
  });

  it('accepts a body of exactly the cap', async () => {
    vi.stubEnv('DOCUMENTS_MAX_UPLOAD_BYTES', '16');

    const res = await upload('?fileName=a.png', Buffer.alloc(16, 1), 'image/png');

    expect(res.status).toBe(202);
  });

  it('413s a declared Content-Length over the cap without contacting Paperless', async () => {
    vi.stubEnv('DOCUMENTS_MAX_UPLOAD_BYTES', '16');

    const res = await upload('?fileName=a.pdf', Buffer.alloc(17, 1));

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      code: 'documents.upload.too_large',
      retryable: false,
      details: { maxUploadBytes: 16 },
    });
    expect(fake.requests).toHaveLength(0);
  });

  it('413s a chunked body once it streams past the cap, and Paperless records no document', async () => {
    vi.stubEnv('DOCUMENTS_MAX_UPLOAD_BYTES', '16');

    const res = await chunkedUpload([
      Buffer.alloc(10, 1),
      Buffer.alloc(10, 2),
      Buffer.alloc(10, 3),
    ]);

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({ code: 'documents.upload.too_large' });
    expect(fake.uploads).toHaveLength(0);
  });

  it('streams a chunked body under the cap', async () => {
    const res = await chunkedUpload([Buffer.from('ab'), Buffer.from('cd')]);

    expect(res.status).toBe(202);
    expect(fake.uploads[0]?.bytes.toString()).toBe('abcd');
  });

  it('declares the exact multipart length to Paperless, counting a non-ASCII title in bytes', async () => {
    const res = await upload(
      '?fileName=gu%C3%ADa.pdf&title=Gu%C3%ADa%20%C3%B1',
      Buffer.from('hello')
    );

    expect(res.status).toBe(202);
    const sent = fake.requests.find((r) => r.url === '/api/documents/post_document/');
    expect(sent?.headers['transfer-encoding']).toBeUndefined();
    expect(Number(sent?.headers['content-length'])).toBe(
      Buffer.byteLength(sent?.body ?? '', 'utf8')
    );
    expect(fake.uploads[0]?.fields['title']).toBe('Guía ñ');
    expect(fake.uploads[0]?.fileName).toBe('guía.pdf');
  });

  it('spools a chunked body to a sized request and removes the temporary file', async () => {
    const before = spoolDirs();

    const res = await chunkedUpload([Buffer.from('ab'), Buffer.from('cd')]);

    expect(res.status).toBe(202);
    const sent = fake.requests.find((r) => r.url === '/api/documents/post_document/');
    expect(sent?.headers['content-length']).toBeDefined();
    expect(spoolDirs()).toEqual(before);
  });

  it('removes the temporary file when a chunked body passes the cap', async () => {
    vi.stubEnv('DOCUMENTS_MAX_UPLOAD_BYTES', '3');
    const before = spoolDirs();

    const res = await chunkedUpload([Buffer.from('ab'), Buffer.from('cd')]);

    expect(res.status).toBe(413);
    expect(spoolDirs()).toEqual(before);
  });

  it.each([['application/zip'], ['application/octet-stream'], ['image'], ['']])(
    '415s Content-Type %j',
    async (contentType) => {
      const res = await upload('?fileName=a.bin', Buffer.from('x'), contentType);

      expect(res.status).toBe(415);
      expect(res.body).toMatchObject({
        code: 'documents.upload.unsupported_type',
        details: { allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'] },
      });
      expect(fake.requests).toHaveLength(0);
    }
  );

  it.each([
    [''],
    ['?fileName='],
    ['?fileName=a%0A.pdf'],
    [`?fileName=a.pdf&title=${'t'.repeat(129)}`],
  ])('400s the query %j', async (query) => {
    const res = await upload(query, Buffer.from('x'));

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: 'documents.upload.invalid' });
  });

  it('412s when Paperless is not configured', async () => {
    vi.stubEnv('PAPERLESS_BASE_URL', '');

    const res = await upload('?fileName=a.pdf', Buffer.from('x'));

    expect(res.status).toBe(412);
    expect(res.body).toMatchObject({
      code: 'documents.paperless.not_configured',
      retryable: false,
    });
  });

  it('503s with a retryable envelope when Paperless is unreachable', async () => {
    vi.stubEnv('PAPERLESS_BASE_URL', await unreachablePaperlessUrl());

    const res = await upload('?fileName=a.pdf', Buffer.from('x'));

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'documents.paperless.unavailable', retryable: true });
  });

  it('422s when Paperless rejects the file and 502s when it fails', async () => {
    fake.failWith = 400;
    const rejected = await upload('?fileName=a.pdf', Buffer.from('x'));
    fake.failWith = 500;
    const failed = await upload('?fileName=a.pdf', Buffer.from('x'));

    expect(rejected.status).toBe(422);
    expect(rejected.body).toMatchObject({ code: 'documents.upload.rejected', retryable: false });
    expect(failed.status).toBe(502);
    expect(failed.body).toMatchObject({
      code: 'documents.paperless.upstream_failure',
      retryable: true,
    });
    expect(failed.text).not.toContain('fake failure');
  });
});
