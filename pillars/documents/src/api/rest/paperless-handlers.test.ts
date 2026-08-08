/**
 * Unit tests for the `paperless.*` ts-rest handlers. The Paperless client
 * module is mocked so no real Paperless instance is needed — this file is
 * new (workstream 13, ADR-039): the handlers previously had no dedicated
 * test in inventory.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface MockPaperlessClient {
  getDocumentTypes: ReturnType<typeof vi.fn>;
  getBaseUrl: ReturnType<typeof vi.fn>;
  searchDocuments: ReturnType<typeof vi.fn>;
  getDocument: ReturnType<typeof vi.fn>;
  getDocumentThumbnailUrl: ReturnType<typeof vi.fn>;
}

const mockGetPaperlessClient = vi.fn<() => MockPaperlessClient | null>();

vi.mock('../modules/paperless/index.js', () => ({
  getPaperlessClient: (): MockPaperlessClient | null => mockGetPaperlessClient(),
}));

const { makePaperlessHandlers } = await import('./paperless-handlers.js');
const { PaperlessApiError } = await import('../modules/paperless/types.js');

/** A client stub with every method present, so a test overrides only what it exercises. */
function mockClient(overrides: Partial<MockPaperlessClient> = {}): MockPaperlessClient {
  return {
    getDocumentTypes: vi.fn(),
    getBaseUrl: vi.fn(),
    searchDocuments: vi.fn(),
    getDocument: vi.fn(),
    getDocumentThumbnailUrl: vi.fn(),
    ...overrides,
  };
}

const paperlessDocument = {
  id: 42,
  title: 'Electricity bill',
  created: '2026-01-01T00:00:00Z',
  originalFileName: 'bill.pdf',
};

const wireDocument = { ...paperlessDocument, thumbnailUrl: 'https://paperless.example/thumb/42' };

beforeEach(() => {
  mockGetPaperlessClient.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('paperless.status', () => {
  it('reports unconfigured when no client is available', async () => {
    mockGetPaperlessClient.mockReturnValue(null);
    const handlers = makePaperlessHandlers();

    const result = await handlers.status();

    expect(result).toEqual({
      status: 200,
      body: { data: { configured: false, available: false, baseUrl: null } },
    });
  });

  it('reports configured + available when the upstream call succeeds', async () => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({
        getDocumentTypes: vi.fn().mockResolvedValue([]),
        getBaseUrl: vi.fn().mockReturnValue('https://paperless.example'),
      })
    );
    const handlers = makePaperlessHandlers();

    const result = await handlers.status();

    expect(result).toEqual({
      status: 200,
      body: { data: { configured: true, available: true, baseUrl: 'https://paperless.example' } },
    });
  });

  it('reports configured + unavailable when the upstream call throws', async () => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({
        getDocumentTypes: vi.fn().mockRejectedValue(new PaperlessApiError(0, 'timeout')),
        getBaseUrl: vi.fn().mockReturnValue('https://paperless.example'),
      })
    );
    const handlers = makePaperlessHandlers();

    const result = await handlers.status();

    expect(result).toEqual({
      status: 200,
      body: { data: { configured: true, available: false, baseUrl: 'https://paperless.example' } },
    });
  });
});

describe('paperless.search', () => {
  it('returns 412 when no client is available', async () => {
    mockGetPaperlessClient.mockReturnValue(null);
    const handlers = makePaperlessHandlers();

    const result = await handlers.search({ query: { query: 'bill' } });

    expect(result.status).toBe(412);
    expect(result.body).toMatchObject({ messageKey: 'documents.paperless.notConfigured' });
  });

  it('maps search results to the wire shape with a thumbnail URL', async () => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({
        searchDocuments: vi.fn().mockResolvedValue({
          documents: [paperlessDocument],
          count: 1,
          next: null,
          previous: null,
        }),
        getDocumentThumbnailUrl: vi.fn().mockReturnValue('https://paperless.example/thumb/42'),
      })
    );
    const handlers = makePaperlessHandlers();

    const result = await handlers.search({ query: { query: 'bill' } });

    expect(result).toEqual({ status: 200, body: { data: [wireDocument] } });
  });

  it('rethrows a PaperlessApiError wrapped in a plain Error', async () => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({
        searchDocuments: vi.fn().mockRejectedValue(new PaperlessApiError(500, 'boom')),
      })
    );
    const handlers = makePaperlessHandlers();

    await expect(handlers.search({ query: { query: 'bill' } })).rejects.toThrow(
      'Paperless error: boom'
    );
  });

  it('rethrows a non-PaperlessApiError as-is', async () => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({ searchDocuments: vi.fn().mockRejectedValue(new Error('unexpected')) })
    );
    const handlers = makePaperlessHandlers();

    await expect(handlers.search({ query: { query: 'bill' } })).rejects.toThrow('unexpected');
  });
});

/**
 * `get` is the resolve probe behind soft `pops://documents/document/<id>`
 * URIs. The three-way split below is the whole point of the route: only the
 * 404 case may ever be read as "this document is gone".
 */
describe('paperless.get', () => {
  it('returns the document in the same wire shape search uses', async () => {
    const getDocument = vi.fn().mockResolvedValue(paperlessDocument);
    mockGetPaperlessClient.mockReturnValue(
      mockClient({
        getDocument,
        getDocumentThumbnailUrl: vi.fn().mockReturnValue('https://paperless.example/thumb/42'),
      })
    );
    const handlers = makePaperlessHandlers();

    const result = await handlers.get({ params: { id: 42 } });

    expect(result).toEqual({ status: 200, body: { data: wireDocument } });
    expect(getDocument).toHaveBeenCalledWith(42);
  });

  it('returns 404 when Paperless reports the document is gone', async () => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({
        getDocument: vi.fn().mockRejectedValue(new PaperlessApiError(404, 'Not found.')),
      })
    );
    const handlers = makePaperlessHandlers();

    const result = await handlers.get({ params: { id: 42 } });

    expect(result.status).toBe(404);
    expect(result.body).toMatchObject({ messageKey: 'documents.paperless.notFound' });
  });

  it('returns 412 rather than 404 when Paperless is not configured', async () => {
    mockGetPaperlessClient.mockReturnValue(null);
    const handlers = makePaperlessHandlers();

    const result = await handlers.get({ params: { id: 42 } });

    expect(result.status).toBe(412);
    expect(result.body).toMatchObject({ messageKey: 'documents.paperless.notConfigured' });
  });

  it.each([
    ['a network error', new PaperlessApiError(0, 'Network error: fetch failed')],
    ['an upstream 500', new PaperlessApiError(500, 'boom')],
    ['an upstream 503', new PaperlessApiError(503, 'unavailable')],
  ])('throws rather than reporting not-found on %s', async (_label, err) => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({ getDocument: vi.fn().mockRejectedValue(err) })
    );
    const handlers = makePaperlessHandlers();

    await expect(handlers.get({ params: { id: 42 } })).rejects.toThrow('Paperless error:');
  });

  it('rethrows a non-PaperlessApiError as-is', async () => {
    mockGetPaperlessClient.mockReturnValue(
      mockClient({ getDocument: vi.fn().mockRejectedValue(new Error('unexpected')) })
    );
    const handlers = makePaperlessHandlers();

    await expect(handlers.get({ params: { id: 42 } })).rejects.toThrow('unexpected');
  });
});
