import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { loadResponsibility, replaceResponsibility } from './api';
import { ResponsibilitySessions } from './ResponsibilitySessions';
import { labels } from './test-utils';
import { useResponsibility } from './use-responsibility';

import type { ReactNode } from 'react';

import type { ArrangementResponsibility, ArrangementTarget } from './types';

vi.mock('./api', async (original) => ({
  ...(await original<typeof import('./api')>()),
  loadResponsibility: vi.fn(),
  replaceResponsibility: vi.fn(),
}));
const load = vi.mocked(loadResponsibility);
const replace = vi.mocked(replaceResponsibility);
const target = { targetKind: 'rental', targetId: 61 } as const;
const source: ArrangementResponsibility = {
  ...target,
  tripId: 7,
  responsibility: null,
  revision: 4,
};
const contactA = { kind: 'contact', uri: 'pops:contacts/contact/issued-a' } as const;
const contactB = { kind: 'contact', uri: 'pops:contacts/contact/issued-b' } as const;
const pickerA = { Chooser: () => null };
const pickerB = { Chooser: () => null };
beforeEach(() => {
  load.mockResolvedValue(source);
});
afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});
function setup() {
  const cache = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  const advance = vi.fn();
  const identity = {
    tripId: 7,
    labels,
    formatDate: (date: string): string => date,
    advanceContactChooserIntent: advance,
  };
  let visible = true;
  let selected: ArrangementTarget = target;
  const hook = renderHook(() => useResponsibility(identity, selected), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={cache}>
        <ResponsibilitySessions>
          <div key={`${selected.targetKind}:${selected.targetId}`}>{visible ? children : null}</div>
        </ResponsibilitySessions>
      </QueryClientProvider>
    ),
  });
  return {
    ...hook,
    advance,
    view: (open: boolean, next: ArrangementTarget = target): void => {
      visible = open;
      selected = next;
      hook.rerender();
    },
  };
}
function deferred() {
  let finish: ((value: ArrangementResponsibility) => void) | undefined;
  const promise = new Promise<ArrangementResponsibility>((resolve) => {
    finish = resolve;
  });
  return {
    promise,
    finish: (value: ArrangementResponsibility): void => {
      if (!finish) throw new Error('Missing deferred response');
      finish(value);
    },
  };
}
describe('Retained responsibility operations', () => {
  it('retains a pending PUT across close/reopen and advances only its exact known receipt', async () => {
    const response = deferred();
    replace.mockReturnValueOnce(response.promise);
    const { result, view, advance } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    let saving: Promise<void> | undefined;
    act(() => {
      saving = result.current.save(source, contactA, pickerA);
    });
    act(() => view(false));
    act(() => view(true));
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(result.current.busy).toBe(true);
    await act(async () => {
      await result.current.save(source, contactB, pickerB);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    expect(advance).not.toHaveBeenCalled();
    act(() => view(false));
    const confirmed = { ...source, responsibility: contactA, revision: 5 };
    load.mockResolvedValue(confirmed);
    await act(async () => {
      response.finish(confirmed);
      await saving;
    });
    expect(advance).toHaveBeenCalledExactlyOnceWith(target, pickerA);
    act(() => view(true));
    await waitFor(() => expect(result.current.query.data).toEqual(confirmed));
    expect(result.current.failure).toBeUndefined();
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(replace).toHaveBeenCalledExactlyOnceWith(expect.anything(), source, contactA);
  });
  it('keeps foreign identical GET state separate from an unknown PUT until explicit reconciliation', async () => {
    const error = new Error('Lost PUT response');
    replace.mockRejectedValueOnce(error);
    const { result, view, advance } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save(source, contactA, pickerA);
    });
    act(() => view(false));
    const foreign = { ...source, responsibility: contactA, revision: 5 };
    load.mockResolvedValue(foreign);
    act(() => view(true));
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.query.data).toEqual(foreign));
    expect(result.current.failure?.write).toEqual({ source, value: contactA, picker: pickerA });
    expect(advance).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.save(foreign, contactB, pickerB);
    });
    expect(replace).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.reconcile();
    });
    expect(result.current.failure).toBeUndefined();
    expect(advance).toHaveBeenCalledExactlyOnceWith(target, pickerA);
    expect(replace).toHaveBeenCalledTimes(1);
    const confirmedB = { ...foreign, responsibility: contactB, revision: 6 };
    replace.mockResolvedValueOnce(confirmedB);
    await act(async () => {
      await result.current.save(foreign, contactB, pickerB);
    });
    expect(replace).toHaveBeenLastCalledWith(expect.anything(), foreign, contactB);
    expect(advance).toHaveBeenLastCalledWith(target, pickerB);
  });
  it('retries the retained source revision and Contact A after a different canonical Contact arrives', async () => {
    replace.mockRejectedValueOnce(new Error('Response lost'));
    const { result, view, advance } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save(source, contactA, pickerA);
    });
    act(() => view(false));
    load.mockResolvedValue({ ...source, responsibility: contactB, revision: 9 });
    act(() => view(true));
    await act(async () => {
      await result.current.reload();
    });
    replace.mockRejectedValueOnce(new Error('Stale revision'));
    await act(async () => {
      await result.current.retry();
    });
    expect(replace.mock.calls.map((call) => call.slice(1))).toEqual([
      [source, contactA],
      [source, contactA],
    ]);
    expect(advance).not.toHaveBeenCalled();
    expect(result.current.failure?.write).toEqual({ source, value: contactA, picker: pickerA });
  });
  it('keeps independent source-kind targets separate while preserving earlier uncertainty', async () => {
    replace.mockRejectedValueOnce(new Error('Response lost'));
    const { result, view, advance } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save(source, contactA, pickerA);
    });
    const other = { ...source, targetKind: 'stay' } as const;
    load.mockResolvedValue(other);
    act(() => view(true, other));
    await waitFor(() => expect(result.current.query.data).toEqual(other));
    expect(result.current.failure).toBeUndefined();
    replace.mockResolvedValueOnce({ ...other, responsibility: contactB, revision: 5 });
    await act(async () => {
      await result.current.save(other, contactB, pickerB);
    });
    expect(advance).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ targetKind: 'stay', targetId: 61 }),
      pickerB
    );
    load.mockResolvedValue(source);
    act(() => view(true));
    await waitFor(() => expect(result.current.failure?.write.value).toEqual(contactA));
    expect(replace).toHaveBeenCalledTimes(2);
  });
  it('accepts its own delayed 200 receipt while preserving a later foreign assignment', async () => {
    const response = deferred();
    replace.mockReturnValueOnce(response.promise);
    const { result, view, advance } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    let saving: Promise<void> | undefined;
    act(() => {
      saving = result.current.save(source, contactA, pickerA);
    });
    const later = { ...source, responsibility: contactB, revision: 6 };
    load.mockResolvedValue(later);
    act(() => view(false));
    act(() => view(true));
    await waitFor(() => expect(result.current.query.isFetching).toBe(false));
    await act(async () => {
      await result.current.reload();
    });
    await waitFor(() => expect(result.current.query.data).toEqual(later));
    await act(async () => {
      response.finish({ ...source, responsibility: contactA, revision: 5 });
      await saving;
    });
    expect(advance).toHaveBeenCalledExactlyOnceWith(target, pickerA);
    expect(result.current.query.data).toEqual(later);
    expect(result.current.failure).toBeUndefined();
  });
  it('retains uncertainty when explicit reconciliation cannot read the current source', async () => {
    replace.mockRejectedValueOnce(new Error('Response lost'));
    const { result, advance } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save(source, contactA, pickerA);
    });
    load.mockRejectedValueOnce(new Error('Source unavailable'));
    await act(async () => {
      await result.current.reconcile();
    });
    expect(result.current.failure?.write).toEqual({ source, value: contactA, picker: pickerA });
    expect(advance).not.toHaveBeenCalled();
    expect(replace).toHaveBeenCalledTimes(1);
  });
  it('keeps a newer confirmed revision when an earlier GET response arrives late', async () => {
    const read = deferred();
    const { result } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    load.mockReturnValueOnce(read.promise);
    let reloading: Promise<void> | undefined;
    act(() => {
      reloading = result.current.reload();
    });
    const confirmed = { ...source, responsibility: contactA, revision: 5 };
    replace.mockResolvedValueOnce(confirmed);
    await act(async () => {
      await result.current.save(source, contactA, pickerA);
    });
    await act(async () => {
      read.finish(source);
      await reloading;
    });
    await waitFor(() => expect(result.current.query.data).toEqual(confirmed));
  });
  it('accepts the producer-verified canonical Contact redirect only from its own PUT receipt', async () => {
    const canonical = { ...source, responsibility: contactB, revision: 5 };
    replace.mockResolvedValueOnce(canonical);
    const { result, advance } = setup();
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    await act(async () => {
      await result.current.save(source, contactA, pickerA);
    });
    expect(replace).toHaveBeenCalledExactlyOnceWith(expect.anything(), source, contactA);
    expect(result.current.query.data).toEqual(canonical);
    expect(result.current.failure).toBeUndefined();
    expect(advance).toHaveBeenCalledExactlyOnceWith(target, pickerA);
  });
  it.each([
    { ...source, responsibility: { kind: 'self' }, revision: 5 },
    { ...source, responsibility: contactA, revision: 8 },
    { ...source, targetId: 99, responsibility: contactA, revision: 5 },
  ] satisfies ArrangementResponsibility[])(
    'rejects a receipt outside its selected kind, target or next revision',
    async (receipt) => {
      replace.mockResolvedValueOnce(receipt);
      const { result, advance } = setup();
      await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
      await act(async () => {
        await result.current.save(source, contactA, pickerA);
      });
      expect(result.current.failure?.write).toEqual({ source, value: contactA, picker: pickerA });
      expect(advance).not.toHaveBeenCalled();
      expect(result.current.query.data).toEqual(source);
    }
  );
});
