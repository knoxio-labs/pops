/**
 * `GET /paperless/documents/:id/download` end to end against a fake
 * Paperless that, like 3.2.1, ignores `Range` unless told otherwise.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startFakePaperless, type FakePaperless } from '../__tests__/fake-paperless.js';
import {
  createTestTransport,
  type TestRequest,
  type TestResponse,
} from '../__tests__/test-http.js';
import { unreachablePaperlessUrl } from '../__tests__/unreachable-url.js';
import { createDocumentsApiApp } from '../app.js';

const { requestOn } = createTestTransport();

const BYTES = Buffer.from('0123456789');

let fake: FakePaperless;

function download(path = '/paperless/documents/7/download'): TestRequest {
  return requestOn(
    createDocumentsApiApp({ version: '0.0.1-test', selfBaseUrl: 'http://localhost:3012' })
  )
    .get(path)
    .buffer(true)
    .parse((res, done) => {
      const parts: Buffer[] = [];
      res.on('data', (chunk: Buffer) => parts.push(chunk));
      res.on('end', () => done(null, Buffer.concat(parts)));
    });
}

beforeEach(async () => {
  fake = await startFakePaperless();
  fake.documents.set(7, {
    bytes: BYTES,
    mimeType: 'application/pdf',
    fileName: 'manual.pdf',
    title: 'Manual',
  });
  vi.stubEnv('PAPERLESS_BASE_URL', fake.url);
  vi.stubEnv('PAPERLESS_API_TOKEN', 'test-token');
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await fake.close();
});

function bodyOf(res: TestResponse): string {
  const body: unknown = res.body;
  return Buffer.isBuffer(body) ? body.toString() : '';
}

describe('GET /paperless/documents/:id/download', () => {
  it('streams the original with its type, disposition and length', async () => {
    const res = await download();

    expect(res.status).toBe(200);
    expect(bodyOf(res)).toBe('0123456789');
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.headers['content-disposition']).toBe('attachment; filename="manual.pdf"');
    expect(res.headers['content-length']).toBe('10');
    expect(res.headers['accept-ranges']).toBe('bytes');
    expect(fake.requests[0]?.url).toBe('/api/documents/7/download/?original=true');
    expect(fake.requests[0]?.headers.authorization).toBe('Token test-token');
  });

  it('asks for the archived version with ?original=false', async () => {
    await download('/paperless/documents/7/download?original=false');

    expect(fake.requests[0]?.url).toBe('/api/documents/7/download/?original=false');
  });

  it.each([
    ['bytes=2-5', 'bytes 2-5/10', '2345'],
    ['bytes=7-', 'bytes 7-9/10', '789'],
    ['bytes=-3', 'bytes 7-9/10', '789'],
    ['bytes=8-100', 'bytes 8-9/10', '89'],
  ])(
    'answers Range %s with a 206 sliced here when Paperless sends the whole file',
    async (range, contentRange, expected) => {
      const res = await download().set('range', range);

      expect(res.status).toBe(206);
      expect(res.headers['content-range']).toBe(contentRange);
      expect(res.headers['content-length']).toBe(String(expected.length));
      expect(bodyOf(res)).toBe(expected);
      expect(fake.requests[0]?.headers.range).toBe(range);
    }
  );

  it('passes a 206 from Paperless through unchanged', async () => {
    fake.honourRange = true;

    const res = await download().set('range', 'bytes=1-3');

    expect(res.status).toBe(206);
    expect(res.headers['content-range']).toBe('bytes 1-3/10');
    expect(bodyOf(res)).toBe('123');
  });

  it('416s a range past the end of the file', async () => {
    const res = await download().set('range', 'bytes=10-');

    expect(res.status).toBe(416);
    expect(res.headers['content-range']).toBe('bytes */10');
  });

  it('serves the whole file for a multi-range or malformed Range', async () => {
    const multi = await download().set('range', 'bytes=0-1,4-5');
    const malformed = await download().set('range', 'pages=1');

    expect(multi.status).toBe(200);
    expect(bodyOf(multi)).toBe('0123456789');
    expect(malformed.status).toBe(200);
  });

  it('404s only when Paperless says the document is gone', async () => {
    const res = await download('/paperless/documents/8/download');

    expect(res.status).toBe(404);
    expect(JSON.parse(bodyOf(res))).toMatchObject({ code: 'documents.paperless.not_found' });
  });

  it('502s, not 404s, on any other Paperless failure', async () => {
    fake.failWith = 500;

    const res = await download();

    expect(res.status).toBe(502);
    expect(JSON.parse(bodyOf(res))).toMatchObject({
      code: 'documents.paperless.upstream_failure',
      retryable: true,
    });
  });

  it('412s when Paperless is not configured', async () => {
    vi.stubEnv('PAPERLESS_API_TOKEN', '');

    const res = await download();

    expect(res.status).toBe(412);
    expect(JSON.parse(bodyOf(res))).toMatchObject({ code: 'documents.paperless.not_configured' });
  });

  it('503s when Paperless is unreachable', async () => {
    vi.stubEnv('PAPERLESS_BASE_URL', await unreachablePaperlessUrl());

    const res = await download();

    expect(res.status).toBe(503);
    expect(JSON.parse(bodyOf(res))).toMatchObject({
      code: 'documents.paperless.unavailable',
      retryable: true,
    });
  });

  it.each([['abc'], ['0']])('400s the id %j without contacting Paperless', async (id) => {
    const res = await download(`/paperless/documents/${id}/download`);

    expect(res.status).toBe(400);
    expect(fake.requests).toHaveLength(0);
  });
});
