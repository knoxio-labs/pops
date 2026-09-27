/**
 * Tests for the documents pillar's Paperless-ngx thumbnail proxy route. The
 * Paperless client module is mocked so no real Paperless instance is needed;
 * the same module specifier `../modules/paperless/index.js` that `router.ts`
 * imports is mocked here, so the route gets the fake client.
 *
 * Moved (workstream 13, ADR-039) from
 * `pillars/inventory/src/api/files/router.thumbnail.test.ts`, path
 * updated from `/inventory/documents/:id/thumbnail` to
 * `/documents/:id/thumbnail`.
 */
import express, { type Express } from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createPillarErrorHandlers } from '@pops/pillar-express';

import { createTestTransport } from '../__tests__/test-http.js';

interface MockPaperlessClient {
  fetchThumbnail: ReturnType<typeof vi.fn>;
}

const mockGetPaperlessClient = vi.fn<() => MockPaperlessClient | null>();

vi.mock('../modules/paperless/index.js', () => ({
  getPaperlessClient: (): MockPaperlessClient | null => mockGetPaperlessClient(),
}));

const { createDocumentsFilesRouter } = await import('./router.js');

function app(): Express {
  const a = express();
  const errors = createPillarErrorHandlers({ pillar: 'documents' });
  a.use(errors.requestId);
  a.use(createDocumentsFilesRouter());
  a.use(errors.final);
  return a;
}

function expectErrorBody(
  body: unknown,
  expected: { readonly code: string; readonly message: string; readonly retryable: boolean }
): void {
  expect(body).toEqual({
    ...expected,
    requestId: expect.any(String),
    details: expect.any(Object),
  });
}

beforeEach(() => {
  mockGetPaperlessClient.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

const { requestOn } = createTestTransport();

describe('GET /documents/:id/thumbnail', () => {
  it('returns 400 for a non-numeric id', async () => {
    const res = await requestOn(app()).get('/documents/abc/thumbnail');
    expect(res.status).toBe(400);
    expectErrorBody(res.body, {
      code: 'documents.thumbnail.invalid_id',
      message: 'The document id is invalid.',
      retryable: false,
    });
  });

  it('returns 503 when Paperless is not configured', async () => {
    mockGetPaperlessClient.mockReturnValue(null);
    const res = await requestOn(app()).get('/documents/42/thumbnail');
    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: 'documents.paperless.not_configured',
      message: 'Paperless-ngx is not configured.',
      requestId: expect.any(String),
      retryable: false,
    });
  });

  describe('when Paperless is configured', () => {
    const fetchThumbnail = vi.fn();

    beforeEach(() => {
      mockGetPaperlessClient.mockReturnValue({ fetchThumbnail });
      fetchThumbnail.mockReset();
    });

    it('proxies the thumbnail image on success', async () => {
      const bytes = Buffer.from('fake-image-data');
      fetchThumbnail.mockResolvedValue({
        ok: true,
        headers: new Headers({ 'content-type': 'image/webp' }),
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      });

      const res = await requestOn(app()).get('/documents/42/thumbnail');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/webp');
      expect(res.headers['cache-control']).toBe('public, max-age=3600');
      expect(fetchThumbnail).toHaveBeenCalledWith(42);
    });

    it('defaults content-type to image/png when the header is missing', async () => {
      const bytes = Buffer.from('fake-png-data');
      fetchThumbnail.mockResolvedValue({
        ok: true,
        headers: new Headers(),
        arrayBuffer: () => Promise.resolve(bytes.buffer),
      });

      const res = await requestOn(app()).get('/documents/42/thumbnail');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('image/png');
    });

    it('returns 404 when the document is not in Paperless', async () => {
      fetchThumbnail.mockResolvedValue({ ok: false, status: 404 });
      const res = await requestOn(app()).get('/documents/999/thumbnail');
      expect(res.status).toBe(404);
      expectErrorBody(res.body, {
        code: 'documents.thumbnail.not_found',
        message: 'The document thumbnail was not found.',
        retryable: false,
      });
    });

    it('returns 502 on other upstream errors', async () => {
      fetchThumbnail.mockResolvedValue({ ok: false, status: 500 });
      const res = await requestOn(app()).get('/documents/42/thumbnail');
      expect(res.status).toBe(502);
      expectErrorBody(res.body, {
        code: 'documents.thumbnail.upstream_failure',
        message: 'The document thumbnail could not be fetched.',
        retryable: true,
      });
    });

    it('returns 502 when the client throws PaperlessApiError', async () => {
      const { PaperlessApiError } = await import('../modules/paperless/types.js');
      fetchThumbnail.mockRejectedValue(new PaperlessApiError(0, 'Network error: timeout'));
      const res = await requestOn(app()).get('/documents/42/thumbnail');
      expect(res.status).toBe(502);
      expectErrorBody(res.body, {
        code: 'documents.thumbnail.upstream_failure',
        message: 'The document thumbnail could not be fetched.',
        retryable: true,
      });
    });
  });
});
