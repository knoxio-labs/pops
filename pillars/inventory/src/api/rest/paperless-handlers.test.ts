/**
 * Unit tests for inventory's `paperless.*` ts-rest handlers. Since ADR-039
 * workstream 13 these proxy to the `documents` bridge pillar via a
 * `DocumentsClient` seam instead of an embedded `PaperlessClient` — this
 * file is new (the pre-move handlers had no dedicated test).
 */
import { describe, expect, it, vi } from 'vitest';

import { makePaperlessHandlers } from './paperless-handlers.js';

import type { CallFailure } from '@pops/pillar-sdk/client';

import type {
  DocumentsClient,
  PaperlessSearchDocument,
  PaperlessStatus,
} from '../documents/client.js';

function stubClient(overrides: Partial<DocumentsClient> = {}): DocumentsClient {
  return {
    getPaperlessStatus: vi.fn(async () => ({
      configured: false,
      available: false,
      baseUrl: null,
      documentCount: null,
      maxUploadBytes: null,
      allowedMimeTypes: null,
    })),
    searchPaperlessDocuments: vi.fn(async () => ({ ok: true as const, documents: [] })),
    paperlessDocumentMissing: vi.fn(async () => null),
    ...overrides,
  };
}

describe('paperless.status', () => {
  it('returns whatever the documents client reports', async () => {
    const status: PaperlessStatus = {
      configured: true,
      available: true,
      baseUrl: 'https://paperless.example',
      documentCount: 123,
      maxUploadBytes: 104857600,
      allowedMimeTypes: ['application/pdf', 'image/*', 'text/*'],
    };
    const handlers = makePaperlessHandlers(
      stubClient({ getPaperlessStatus: vi.fn(async () => status) })
    );

    const result = await handlers.status();

    expect(result).toEqual({ status: 200, body: { data: status } });
  });

  it('surfaces the degraded "not configured" shape when documents is unreachable', async () => {
    const handlers = makePaperlessHandlers(stubClient());

    const result = await handlers.status();

    expect(result).toEqual({
      status: 200,
      body: {
        data: {
          configured: false,
          available: false,
          baseUrl: null,
          documentCount: null,
          maxUploadBytes: null,
          allowedMimeTypes: null,
        },
      },
    });
  });
});

describe('paperless.search', () => {
  function failingWith(failure: CallFailure): DocumentsClient {
    return stubClient({
      searchPaperlessDocuments: vi.fn(async () => ({ ok: false as const, failure })),
    });
  }

  it('returns 412 only when documents says Paperless is not configured', async () => {
    const handlers = makePaperlessHandlers(
      failingWith({ kind: 'refused', pillar: 'documents', status: 412 })
    );

    await expect(handlers.search({ query: { query: 'bill' } })).rejects.toMatchObject({
      status: 412,
      code: 'inventory.paperless.not_configured',
      details: { messageKey: 'inventory.paperless.notConfigured' },
    });
  });

  it.each([
    ['unavailable', { kind: 'unavailable', pillar: 'documents' }],
    ['degraded', { kind: 'degraded', pillar: 'documents', reason: 'reconciling' }],
    ['rate-limited', { kind: 'rate-limited', pillar: 'documents' }],
  ] satisfies [string, CallFailure][])(
    'returns a retryable 503, not "not configured", when documents is %s',
    async (_kind, failure) => {
      const handlers = makePaperlessHandlers(failingWith(failure));

      await expect(handlers.search({ query: { query: 'bill' } })).rejects.toMatchObject({
        status: 503,
        code: 'inventory.paperless.unavailable',
        retryable: true,
      });
    }
  );

  it.each([
    ['a 500 refusal', { kind: 'refused', pillar: 'documents', status: 500 }],
    ['a contract mismatch', { kind: 'contract-mismatch', pillar: 'documents' }],
  ] satisfies [string, CallFailure][])('returns 502 for %s', async (_label, failure) => {
    const handlers = makePaperlessHandlers(failingWith(failure));

    await expect(handlers.search({ query: { query: 'bill' } })).rejects.toMatchObject({
      status: 502,
      code: 'inventory.paperless.upstream_failure',
    });
  });

  it('returns the documents client results on success', async () => {
    const docs: PaperlessSearchDocument[] = [
      {
        id: 42,
        title: 'Electricity bill',
        created: '2026-01-01T00:00:00Z',
        originalFileName: 'bill.pdf',
        thumbnailUrl: 'https://paperless.example/thumb/42',
      },
    ];
    const handlers = makePaperlessHandlers(
      stubClient({
        searchPaperlessDocuments: vi.fn(async () => ({ ok: true as const, documents: docs })),
      })
    );

    const result = await handlers.search({ query: { query: 'bill' } });

    expect(result).toEqual({ status: 200, body: { data: docs } });
  });

  it('passes the query string through to the documents client', async () => {
    const searchPaperlessDocuments = vi.fn(async () => ({ ok: true as const, documents: [] }));
    const handlers = makePaperlessHandlers(stubClient({ searchPaperlessDocuments }));

    await handlers.search({ query: { query: 'receipt' } });

    expect(searchPaperlessDocuments).toHaveBeenCalledWith('receipt');
  });
});
