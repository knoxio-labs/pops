import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { renderHook, waitFor } from '@testing-library/react';
import { type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const importDraftsClaimMock = vi.hoisted(() => vi.fn());
const importDraftsDiscardMock = vi.hoisted(() => vi.fn());
const importDraftsGetMock = vi.hoisted(() => vi.fn());

vi.mock('../../../finance-api/index.js', () => ({
  importDraftsClaim: importDraftsClaimMock,
  importDraftsDiscard: importDraftsDiscardMock,
  importDraftsGet: importDraftsGetMock,
}));

import { useDraftHydration } from './useDraftHydration';

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe('useDraftHydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('keeps a non-404 failure distinct from a missing draft', async () => {
    importDraftsGetMock.mockResolvedValue({
      error: {
        code: 'finance.imports.draft_unavailable',
        message: 'Draft unavailable',
        requestId: 'req-draft',
        retryable: true,
      },
      response: { status: 503 },
    });

    const { result } = renderHook(() => useDraftHydration('draft-1'), { wrapper });

    await waitFor(() => expect(result.current.gate.status).toBe('error'));
    expect(result.current.gate).toMatchObject({
      status: 'error',
      error: { code: 'finance.imports.draft_unavailable' },
    });
  });

  it('classifies only a 404 as a gone draft', async () => {
    importDraftsGetMock.mockResolvedValue({
      error: {
        code: 'finance.imports.draft_not_found',
        message: 'Draft not found',
        requestId: 'req-missing-draft',
        retryable: false,
      },
      response: { status: 404 },
    });

    const { result } = renderHook(() => useDraftHydration('draft-2'), { wrapper });

    await waitFor(() => expect(result.current.gate.status).toBe('gone'));
  });
});
