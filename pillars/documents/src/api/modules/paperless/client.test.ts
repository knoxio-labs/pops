/**
 * PaperlessClient unit tests — all HTTP calls mocked via
 * `vi.stubGlobal('fetch', ...)`. Moved (workstream 13, ADR-039) from
 * pillars/inventory/src/api/modules/paperless/ alongside the client
 * itself; this file is new — the client previously had no dedicated test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PaperlessClient } from './client.js';
import { PaperlessApiError } from './types.js';

function mockJsonResponse(body: unknown, status = 200, statusText = 'OK'): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: () => Promise.resolve(body),
    headers: new Headers({ 'content-type': 'application/json' }),
  } as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PaperlessClient construction', () => {
  it('throws when the base URL is empty', () => {
    expect(() => new PaperlessClient('', 'token')).toThrow('Paperless URL is required');
  });

  it('throws when the token is empty', () => {
    expect(() => new PaperlessClient('https://paperless.example', '')).toThrow(
      'Paperless token is required'
    );
  });

  it('strips a trailing slash from the base URL', () => {
    const client = new PaperlessClient('https://paperless.example/', 'token');
    expect(client.getBaseUrl()).toBe('https://paperless.example');
  });
});

describe('PaperlessClient.searchDocuments', () => {
  it('maps the paginated raw response to domain documents', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({
        count: 1,
        next: null,
        previous: null,
        results: [
          {
            id: 42,
            correspondent: 1,
            document_type: 2,
            title: 'Electricity bill',
            content: 'body',
            tags: [3, 4],
            created: '2026-01-01T00:00:00Z',
            created_date: '2026-01-01',
            modified: '2026-01-02T00:00:00Z',
            added: '2026-01-01T00:00:00Z',
            archive_serial_number: null,
            original_file_name: 'bill.pdf',
            archived_file_name: 'bill-archived.pdf',
            notes: [],
          },
        ],
      })
    );

    const client = new PaperlessClient('https://paperless.example', 'token');
    const result = await client.searchDocuments('bill');

    expect(result.count).toBe(1);
    expect(result.documents).toEqual([
      {
        id: 42,
        correspondentId: 1,
        documentTypeId: 2,
        title: 'Electricity bill',
        content: 'body',
        tagIds: [3, 4],
        created: '2026-01-01T00:00:00Z',
        createdDate: '2026-01-01',
        modified: '2026-01-02T00:00:00Z',
        added: '2026-01-01T00:00:00Z',
        archiveSerialNumber: null,
        originalFileName: 'bill.pdf',
        archivedFileName: 'bill-archived.pdf',
      },
    ]);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain('/api/documents/?query=bill&page=1');
    expect((init.headers as Record<string, string>)['Authorization']).toBe('Token token');
  });

  it('throws PaperlessApiError with the upstream detail message on a non-ok response', async () => {
    fetchMock.mockResolvedValueOnce(
      mockJsonResponse({ detail: 'Invalid token' }, 401, 'Unauthorized')
    );

    const client = new PaperlessClient('https://paperless.example', 'token');

    await expect(client.searchDocuments('bill')).rejects.toMatchObject({
      status: 401,
      message: 'Invalid token',
    });
  });

  it('wraps a network failure in PaperlessApiError with status 0', async () => {
    fetchMock.mockRejectedValueOnce(new Error('timeout'));

    const client = new PaperlessClient('https://paperless.example', 'token');

    await expect(client.searchDocuments('bill')).rejects.toMatchObject({
      status: 0,
      message: expect.stringContaining('Network error'),
    });
  });
});

describe('PaperlessClient thumbnail + download URLs', () => {
  it('builds the thumbnail URL against the base URL', () => {
    const client = new PaperlessClient('https://paperless.example', 'token');
    expect(client.getDocumentThumbnailUrl(42)).toBe(
      'https://paperless.example/api/documents/42/thumb/'
    );
  });

  it('builds the download URL against the base URL', () => {
    const client = new PaperlessClient('https://paperless.example', 'token');
    expect(client.getDocumentDownloadUrl(42)).toBe(
      'https://paperless.example/api/documents/42/download/'
    );
  });
});

describe('PaperlessClient.fetchThumbnail', () => {
  it('passes through a successful response', async () => {
    const response = mockJsonResponse({}, 200);
    fetchMock.mockResolvedValueOnce(response);

    const client = new PaperlessClient('https://paperless.example', 'token');
    const result = await client.fetchThumbnail(42);

    expect(result).toBe(response);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe('https://paperless.example/api/documents/42/thumb/');
  });

  it('wraps a network failure in PaperlessApiError', async () => {
    fetchMock.mockRejectedValueOnce(new Error('connection reset'));
    const client = new PaperlessClient('https://paperless.example', 'token');

    await expect(client.fetchThumbnail(42)).rejects.toBeInstanceOf(PaperlessApiError);
  });
});
