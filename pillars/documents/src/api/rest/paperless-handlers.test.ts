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
  getDocumentThumbnailUrl: ReturnType<typeof vi.fn>;
}

const mockGetPaperlessClient = vi.fn<() => MockPaperlessClient | null>();

vi.mock('../modules/paperless/index.js', () => ({
  getPaperlessClient: (): MockPaperlessClient | null => mockGetPaperlessClient(),
}));

const { makePaperlessHandlers } = await import('./paperless-handlers.js');
const { PaperlessApiError } = await import('../modules/paperless/types.js');

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
    mockGetPaperlessClient.mockReturnValue({
      getDocumentTypes: vi.fn().mockResolvedValue([]),
      getBaseUrl: vi.fn().mockReturnValue('https://paperless.example'),
      searchDocuments: vi.fn(),
      getDocumentThumbnailUrl: vi.fn(),
    });
    const handlers = makePaperlessHandlers();

    const result = await handlers.status();

    expect(result).toEqual({
      status: 200,
      body: { data: { configured: true, available: true, baseUrl: 'https://paperless.example' } },
    });
  });

  it('reports configured + unavailable when the upstream call throws', async () => {
    mockGetPaperlessClient.mockReturnValue({
      getDocumentTypes: vi.fn().mockRejectedValue(new PaperlessApiError(0, 'timeout')),
      getBaseUrl: vi.fn().mockReturnValue('https://paperless.example'),
      searchDocuments: vi.fn(),
      getDocumentThumbnailUrl: vi.fn(),
    });
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
    mockGetPaperlessClient.mockReturnValue({
      getDocumentTypes: vi.fn(),
      getBaseUrl: vi.fn(),
      searchDocuments: vi.fn().mockResolvedValue({
        documents: [
          {
            id: 42,
            title: 'Electricity bill',
            created: '2026-01-01T00:00:00Z',
            originalFileName: 'bill.pdf',
          },
        ],
        count: 1,
        next: null,
        previous: null,
      }),
      getDocumentThumbnailUrl: vi.fn().mockReturnValue('https://paperless.example/thumb/42'),
    });
    const handlers = makePaperlessHandlers();

    const result = await handlers.search({ query: { query: 'bill' } });

    expect(result).toEqual({
      status: 200,
      body: {
        data: [
          {
            id: 42,
            title: 'Electricity bill',
            created: '2026-01-01T00:00:00Z',
            originalFileName: 'bill.pdf',
            thumbnailUrl: 'https://paperless.example/thumb/42',
          },
        ],
      },
    });
  });

  it('rethrows a PaperlessApiError wrapped in a plain Error', async () => {
    mockGetPaperlessClient.mockReturnValue({
      getDocumentTypes: vi.fn(),
      getBaseUrl: vi.fn(),
      searchDocuments: vi.fn().mockRejectedValue(new PaperlessApiError(500, 'boom')),
      getDocumentThumbnailUrl: vi.fn(),
    });
    const handlers = makePaperlessHandlers();

    await expect(handlers.search({ query: { query: 'bill' } })).rejects.toThrow(
      'Paperless error: boom'
    );
  });

  it('rethrows a non-PaperlessApiError as-is', async () => {
    mockGetPaperlessClient.mockReturnValue({
      getDocumentTypes: vi.fn(),
      getBaseUrl: vi.fn(),
      searchDocuments: vi.fn().mockRejectedValue(new Error('unexpected')),
      getDocumentThumbnailUrl: vi.fn(),
    });
    const handlers = makePaperlessHandlers();

    await expect(handlers.search({ query: { query: 'bill' } })).rejects.toThrow('unexpected');
  });
});
