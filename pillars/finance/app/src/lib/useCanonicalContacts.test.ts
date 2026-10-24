import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { createElement, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { fetchCanonicalContacts, useCanonicalContacts } from './useCanonicalContacts';

const resolve = vi.hoisted(() => vi.fn());
vi.mock('../contacts-api/index.js', () => ({
  entitiesResolve: (...args: unknown[]) => resolve(...args),
}));
function wrapper({ children }: { children: ReactNode }) {
  return createElement(
    QueryClientProvider,
    { client: new QueryClient({ defaultOptions: { queries: { retry: false } } }) },
    children
  );
}
beforeEach(() => resolve.mockReset());

describe('canonical contact query', () => {
  it('preserves separate historical keys and explicit missing results', async () => {
    resolve.mockResolvedValue({
      data: {
        data: [
          { id: 'old-a', canonicalId: 'current' },
          { id: 'old-b', canonicalId: 'current' },
          { id: 'missing', canonicalId: null },
        ],
        revision: 2,
      },
    });
    expect(await fetchCanonicalContacts(['old-a', 'old-b', 'missing'])).toEqual(
      new Map([
        ['old-a', 'current'],
        ['old-b', 'current'],
        ['missing', null],
      ])
    );
  });
  it('keeps a failed directory unavailable instead of claiming identities are missing', async () => {
    resolve.mockResolvedValue({
      error: { message: 'Unavailable' },
      response: new Response(null, { status: 503 }),
    });
    const { result } = renderHook(() => useCanonicalContacts(['old-a']), { wrapper });
    expect(result.current.status).toBe('checking');
    await waitFor(() => expect(result.current.status).toBe('unavailable'));
    expect(result.current.identities).toBeUndefined();
  });
  it('rejects incomplete producer coverage and skips local placeholders', async () => {
    resolve.mockResolvedValue({ data: { data: [], revision: 1 } });
    await expect(fetchCanonicalContacts(['old-a'])).rejects.toThrow('cover every requested');
    resolve.mockClear();
    const { result } = renderHook(
      () => useCanonicalContacts(['temp:entity:one', 'pending:contact:two']),
      { wrapper }
    );
    expect(result.current.status).toBe('ready');
    expect(resolve).not.toHaveBeenCalled();
  });
});

it('discards a previously verified snapshot when a refresh fails', async () => {
  resolve.mockResolvedValue({
    data: { data: [{ id: 'old-a', canonicalId: 'current' }], revision: 1 },
  });
  const { result } = renderHook(() => useCanonicalContacts(['old-a']), { wrapper });
  await waitFor(() => expect(result.current.status).toBe('ready'));
  resolve.mockResolvedValue({
    error: { message: 'Unavailable' },
    response: new Response(null, { status: 503 }),
  });
  await act(async () => {
    await result.current.retry();
  });
  await waitFor(() => expect(result.current.status).toBe('unavailable'));
  expect(result.current.identities).toBeUndefined();
});
