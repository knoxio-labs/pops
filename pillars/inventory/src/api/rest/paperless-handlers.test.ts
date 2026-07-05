/**
 * Unit tests for inventory's `paperless.*` ts-rest handlers. Since ADR-039
 * workstream 13 these proxy to the `documents` bridge pillar via a
 * `DocumentsClient` seam instead of an embedded `PaperlessClient` — this
 * file is new (the pre-move handlers had no dedicated test).
 */
import { describe, expect, it, vi } from 'vitest';

import { makePaperlessHandlers } from './paperless-handlers.js';

import type {
  DocumentsClient,
  PaperlessSearchDocument,
  PaperlessStatus,
} from '../documents/client.js';

function stubClient(overrides: Partial<DocumentsClient> = {}): DocumentsClient {
  return {
    getPaperlessStatus: vi.fn(async () => ({ configured: false, available: false, baseUrl: null })),
    searchPaperlessDocuments: vi.fn(async () => null),
    ...overrides,
  };
}

describe('paperless.status', () => {
  it('returns whatever the documents client reports', async () => {
    const status: PaperlessStatus = {
      configured: true,
      available: true,
      baseUrl: 'https://paperless.example',
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
      body: { data: { configured: false, available: false, baseUrl: null } },
    });
  });
});

describe('paperless.search', () => {
  it('returns 412 when the documents client reports no results are servable', async () => {
    const handlers = makePaperlessHandlers(stubClient());

    const result = await handlers.search({ query: { query: 'bill' } });

    expect(result.status).toBe(412);
    expect(result.body).toMatchObject({ messageKey: 'inventory.paperless.notConfigured' });
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
      stubClient({ searchPaperlessDocuments: vi.fn(async () => docs) })
    );

    const result = await handlers.search({ query: { query: 'bill' } });

    expect(result).toEqual({ status: 200, body: { data: docs } });
  });

  it('passes the query string through to the documents client', async () => {
    const searchPaperlessDocuments = vi.fn(async () => []);
    const handlers = makePaperlessHandlers(stubClient({ searchPaperlessDocuments }));

    await handlers.search({ query: { query: 'receipt' } });

    expect(searchPaperlessDocuments).toHaveBeenCalledWith('receipt');
  });
});
