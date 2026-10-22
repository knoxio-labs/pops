import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { PENDING_DOCUMENTS_REFETCH_MS, useAuxiliaryQueries } from './detail-read-queries';
import { ingestionsFor, documentsFor } from './use-item-detail-state';

import type { ReactNode } from 'react';

const mocks = vi.hoisted(() => ({
  documentsListForItem: vi.fn(),
  paperlessStatus: vi.fn(),
  fixturesListForItem: vi.fn(),
  fixturesList: vi.fn(),
  connectionsGraph: vi.fn(),
}));

vi.mock('../../inventory-api/index.js', () => mocks);

const pagination = { hasMore: false, limit: 500, offset: 0, total: 0 };

const pendingRow = {
  id: 30,
  itemId: 'item-1',
  taskId: 'task-1',
  documentType: 'receipt',
  title: null,
  fileName: 'receipt.pdf',
  state: 'pending' as const,
  reason: null,
  createdAt: '2026-10-01T00:00:00Z',
};

const linkedRow = {
  id: 8,
  itemId: 'item-1',
  documentType: 'receipt',
  title: 'receipt.pdf',
  paperlessDocumentId: 100,
  missing: false,
  createdAt: '2026-10-01T00:00:00Z',
};

function listed(body: { data: unknown[]; pending: unknown[]; failed: unknown[] }) {
  return { data: { ...body, pagination }, error: undefined };
}

function renderQueries() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  return renderHook(() => useAuxiliaryQueries('item-1'), { wrapper });
}

async function advance(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  mocks.paperlessStatus.mockResolvedValue({
    data: {
      data: {
        configured: true,
        available: true,
        baseUrl: null,
        documentCount: 0,
        maxUploadBytes: 104857600,
        allowedMimeTypes: ['application/pdf'],
      },
    },
    error: undefined,
  });
  mocks.fixturesListForItem.mockResolvedValue({ data: { data: [] }, error: undefined });
  mocks.fixturesList.mockResolvedValue({ data: { data: [] }, error: undefined });
});

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe('useAuxiliaryQueries documents polling', () => {
  it('refetches while an upload is pending and stops once it is linked', async () => {
    mocks.documentsListForItem
      .mockResolvedValueOnce(listed({ data: [], pending: [pendingRow], failed: [] }))
      .mockResolvedValue(listed({ data: [linkedRow], pending: [], failed: [] }));
    const { result } = renderQueries();

    await advance(0);
    expect(ingestionsFor(result.current.documentsQuery).pendingDocuments).toEqual([
      { id: 30, title: 'receipt.pdf', kind: 'Receipt', reason: null },
    ]);
    expect(mocks.documentsListForItem).toHaveBeenCalledTimes(1);

    await advance(PENDING_DOCUMENTS_REFETCH_MS);
    await vi.waitFor(() =>
      expect(ingestionsFor(result.current.documentsQuery).pendingDocuments).toEqual([])
    );
    expect(documentsFor(result.current.documentsQuery)?.map((row) => row.id)).toEqual([8]);

    await advance(PENDING_DOCUMENTS_REFETCH_MS * 3);
    expect(mocks.documentsListForItem).toHaveBeenCalledTimes(2);
  });

  it('does not poll when nothing is pending, even with failed uploads', async () => {
    mocks.documentsListForItem.mockResolvedValue(
      listed({ data: [], pending: [], failed: [{ ...pendingRow, state: 'failed', reason: 'bad' }] })
    );
    renderQueries();

    await advance(0);
    await advance(PENDING_DOCUMENTS_REFETCH_MS * 2);
    expect(mocks.documentsListForItem).toHaveBeenCalledTimes(1);
  });
});
