import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CatalogueCompatibility, CatalogueDescriptor, CatalogueOperation } from './types';

const api = vi.hoisted(() => ({ previewDraft: vi.fn() }));

vi.mock('./catalogue-api', () => ({
  catalogueApi: {
    previewDraft: (...args: unknown[]) => api.previewDraft(...args),
  },
}));

import { DRAFT_KEY } from './useCatalogueMutations';
import { useCataloguePreview } from './useCataloguePreview';

const draft: CatalogueDescriptor = {
  revision: {
    abandoned: null,
    baseRevision: 4,
    created: {
      actor: { id: null, kind: 'web', label: 'Owner' },
      at: '2026-09-23T00:00:00.000Z',
    },
    minimumProtocol: 2,
    draftVersion: 3,
    published: null,
    revision: 5,
    status: 'draft',
  },
  types: [],
};

const firstOperation: CatalogueOperation = {
  kind: 'put_type',
  id: '11111111-1111-4111-8111-111111111111',
  label: 'First label',
};
const secondOperation: CatalogueOperation = { ...firstOperation, label: 'Second label' };
const compatible: CatalogueCompatibility = {
  affectedIds: [],
  affectedItems: 0,
  changes: [],
  classification: 'compatible',
};
const forbidden: CatalogueCompatibility = {
  affectedIds: [firstOperation.id ?? ''],
  affectedItems: 1,
  changes: [
    {
      classification: 'forbidden',
      code: 'field_shape_locked',
      definitionId: firstOperation.id ?? '',
    },
  ],
  classification: 'forbidden',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function response(compatibility: CatalogueCompatibility) {
  return { data: { compatibility }, error: undefined };
}

function setup(withDraft = true) {
  const queryClient = new QueryClient();
  if (withDraft) queryClient.setQueryData(DRAFT_KEY, draft);
  const setCompatibility = vi.fn();
  const hook = renderHook(() => useCataloguePreview(queryClient, setCompatibility));
  return { ...hook, setCompatibility };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useCataloguePreview', () => {
  it('debounces edits and previews only the newest operation without patching the draft', async () => {
    api.previewDraft.mockResolvedValue(response(compatible));
    const { result } = setup();

    act(() => {
      result.current.preview(firstOperation);
      result.current.preview(secondOperation);
    });
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(api.previewDraft).toHaveBeenCalledTimes(1);
    expect(api.previewDraft).toHaveBeenCalledWith({
      path: { revision: 5 },
      body: { baseRevision: 4, expectedDraftVersion: 3, operations: [secondOperation] },
    });
  });

  it('does not let an older response replace newer compatibility', async () => {
    const first = deferred<ReturnType<typeof response>>();
    const second = deferred<ReturnType<typeof response>>();
    api.previewDraft.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result, setCompatibility } = setup();

    act(() => result.current.preview(firstOperation));
    await act(() => vi.advanceTimersByTimeAsync(250));
    act(() => result.current.preview(secondOperation));
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => second.resolve(response(forbidden)));
    await act(async () => first.resolve(response(compatible)));

    expect(setCompatibility).toHaveBeenCalledTimes(1);
    expect(setCompatibility).toHaveBeenCalledWith({ compatibility: forbidden, draftVersion: 3 });
  });

  it('ignores a superseded preview error', async () => {
    const first = deferred<ReturnType<typeof response>>();
    api.previewDraft.mockReturnValueOnce(first.promise).mockResolvedValueOnce(response(compatible));
    const { result } = setup();

    act(() => result.current.preview(firstOperation));
    await act(() => vi.advanceTimersByTimeAsync(250));
    act(() => result.current.preview(secondOperation));
    await act(() => vi.advanceTimersByTimeAsync(250));
    await act(async () => first.reject(new Error('late failure')));

    expect(result.current.error).toBeNull();
  });

  it('does not create or preview a draft before the first persisted write', async () => {
    const { result } = setup(false);

    act(() => result.current.preview(firstOperation));
    await act(() => vi.advanceTimersByTimeAsync(250));

    expect(api.previewDraft).not.toHaveBeenCalled();
  });

  it('invalidates an in-flight preview when cancelled', async () => {
    const pending = deferred<ReturnType<typeof response>>();
    api.previewDraft.mockReturnValue(pending.promise);
    const { result, setCompatibility } = setup();

    act(() => result.current.preview(firstOperation));
    await act(() => vi.advanceTimersByTimeAsync(250));
    act(() => result.current.cancel());
    await act(async () => pending.resolve(response(forbidden)));

    expect(setCompatibility).not.toHaveBeenCalled();
  });
});
