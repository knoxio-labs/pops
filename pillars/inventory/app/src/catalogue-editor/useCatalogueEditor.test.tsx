import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ReactNode } from 'react';

import type { CatalogueCompatibility, CatalogueDescriptor } from './types';

const api = vi.hoisted(() => ({
  abandonDraft: vi.fn(),
  createDraft: vi.fn(),
  patchDraft: vi.fn(),
  previewDraft: vi.fn(),
  publishDraft: vi.fn(),
  readAudit: vi.fn(),
  readCatalogue: vi.fn(),
  readDraft: vi.fn(),
}));

vi.mock('./catalogue-api', () => ({
  catalogueApi: {
    abandonDraft: (...args: unknown[]) => api.abandonDraft(...args),
    createDraft: (...args: unknown[]) => api.createDraft(...args),
    patchDraft: (...args: unknown[]) => api.patchDraft(...args),
    previewDraft: (...args: unknown[]) => api.previewDraft(...args),
    publishDraft: (...args: unknown[]) => api.publishDraft(...args),
    readAudit: (...args: unknown[]) => api.readAudit(...args),
    readCatalogue: (...args: unknown[]) => api.readCatalogue(...args),
    readDraft: (...args: unknown[]) => api.readDraft(...args),
  },
}));

import { useCatalogueEditor } from './useCatalogueEditor';
import { DRAFT_KEY } from './useCatalogueMutations';

const TYPE_ID = '11111111-1111-4111-8111-111111111111';

const published: CatalogueDescriptor = {
  revision: {
    abandoned: null,
    baseRevision: null,
    created: {
      actor: { id: null, kind: 'migration', label: 'bootstrap' },
      at: '2026-09-22T00:00:00.000Z',
    },
    minimumProtocol: 2,
    draftVersion: 1,
    published: {
      actor: { id: null, kind: 'migration', label: 'bootstrap' },
      at: '2026-09-22T00:00:00.000Z',
      note: null,
    },
    revision: 1,
    status: 'published',
  },
  types: [],
};

function draft(draftVersion: number): CatalogueDescriptor {
  return {
    revision: {
      ...published.revision,
      baseRevision: 1,
      draftVersion,
      published: null,
      revision: 2,
      status: 'draft',
    },
    types: [],
  };
}

const compatible: CatalogueCompatibility = {
  affectedIds: [],
  affectedItems: 0,
  changes: [],
  classification: 'compatible',
};

function setup() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  function wrapper({ children }: { readonly children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }
  const hook = renderHook(() => useCatalogueEditor(), { wrapper });
  return { ...hook, queryClient };
}

beforeEach(() => {
  vi.clearAllMocks();
  api.readCatalogue.mockResolvedValue({ data: published, error: undefined });
});

describe('useCatalogueEditor readiness', () => {
  it('blocks publication for a resumed draft that was never previewed', async () => {
    api.readDraft.mockResolvedValue({ data: draft(4), error: undefined });
    const { result } = setup();

    await waitFor(() => expect(result.current.catalogue).toBeDefined());

    expect(result.current.readiness).toEqual({ status: 'not_previewed' });
    expect(api.createDraft).not.toHaveBeenCalled();
  });

  it('becomes ready once an edit returns compatibility tied to the resulting draft version', async () => {
    api.readDraft.mockResolvedValue({ data: draft(4), error: undefined });
    api.patchDraft.mockResolvedValue({
      data: { compatibility: compatible, draft: draft(5) },
      error: undefined,
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.catalogue).toBeDefined());

    await act(async () => {
      await result.current.patchDraft.mutateAsync([
        { kind: 'put_type', id: TYPE_ID, label: 'Renamed' },
      ]);
    });

    expect(result.current.readiness).toEqual({ status: 'ready', compatibility: compatible });
  });

  it('marks a prior preview stale once the live draft advances past its version', async () => {
    api.readDraft.mockResolvedValue({ data: draft(4), error: undefined });
    api.patchDraft.mockResolvedValue({
      data: { compatibility: compatible, draft: draft(5) },
      error: undefined,
    });
    const { result, queryClient } = setup();
    await waitFor(() => expect(result.current.catalogue).toBeDefined());

    await act(async () => {
      await result.current.patchDraft.mutateAsync([
        { kind: 'put_type', id: TYPE_ID, label: 'Renamed' },
      ]);
    });
    expect(result.current.readiness.status).toBe('ready');

    act(() => {
      queryClient.setQueryData(DRAFT_KEY, draft(6));
    });

    await waitFor(() => expect(result.current.readiness).toEqual({ status: 'stale' }));
  });

  it('never grants ready from a live preview of an unsaved edit, even when versions match', async () => {
    api.readDraft.mockResolvedValue({ data: draft(4), error: undefined });
    api.previewDraft.mockResolvedValue({ data: { compatibility: compatible }, error: undefined });
    const { result } = setup();
    await waitFor(() => expect(result.current.catalogue).toBeDefined());

    act(() => {
      result.current.previewOperation({ kind: 'put_type', id: TYPE_ID, label: 'Unsaved edit' });
    });

    await waitFor(() => expect(api.previewDraft).toHaveBeenCalled());
    await waitFor(() =>
      expect(result.current.readiness).toEqual({
        status: 'live_preview',
        compatibility: compatible,
      })
    );
    expect(api.patchDraft).not.toHaveBeenCalled();
  });

  it('clears readiness back to not-previewed after reload', async () => {
    api.readDraft.mockResolvedValue({ data: draft(4), error: undefined });
    api.patchDraft.mockResolvedValue({
      data: { compatibility: compatible, draft: draft(5) },
      error: undefined,
    });
    const { result } = setup();
    await waitFor(() => expect(result.current.catalogue).toBeDefined());

    await act(async () => {
      await result.current.patchDraft.mutateAsync([
        { kind: 'put_type', id: TYPE_ID, label: 'Renamed' },
      ]);
    });
    expect(result.current.readiness.status).toBe('ready');

    api.readDraft.mockResolvedValue({ data: draft(5), error: undefined });
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.readiness).toEqual({ status: 'not_previewed' });
  });
});
