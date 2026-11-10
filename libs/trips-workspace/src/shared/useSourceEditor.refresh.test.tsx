import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';

import { useSourceEditor } from './useSourceEditor';

interface Source {
  address: string;
  hostLinks: string[];
  timing: { day?: string; zone?: string };
  revision: number;
}
type Patch = Partial<Omit<Source, 'revision'>>;
const initial: Source = {
  address: 'Original address',
  hostLinks: ['original'],
  timing: { day: '2029-01-02', zone: 'UTC' },
  revision: 0,
};
const source = ({ address, hostLinks, timing }: Source): Patch => ({ address, hostLinks, timing });
afterEach(cleanup);

function setup(save: (patch: Patch, saved: Source) => Promise<Source>) {
  return renderHook(({ value }) => useSourceEditor(value, { source, save, onSaved: vi.fn() }), {
    initialProps: { value: initial },
  });
}

it('refreshes untouched host arrays while retaining a failed address and its original confirmed baseline', async () => {
  const fresh = { ...initial, hostLinks: ['original', 'foreign'], revision: 1 };
  const changed = { ...fresh, address: 'New address', hostLinks: ['replacement', 'foreign'] };
  const save = vi
    .fn<(patch: Patch, saved: Source) => Promise<Source>>()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce(changed);
  const { result, rerender } = setup(save);
  await act(async () => {
    await result.current.commit({ address: 'New address' });
  });
  rerender({ value: fresh });
  expect(result.current.saved).toEqual(fresh);
  expect(result.current.draft).toEqual({ ...fresh, address: 'New address' });
  expect(result.current.conflict).toBe(false);
  await act(async () => {
    await result.current.commit({ hostLinks: ['replacement', 'foreign'] });
  });
  expect(save.mock.calls[1]).toEqual([
    { address: 'New address', hostLinks: ['replacement', 'foreign'] },
    initial,
  ]);
});

it('treats nested timing and host arrays as atomic conflicting fields', async () => {
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>();
  const { result, rerender } = setup(save);
  act(() => result.current.edit({ timing: { zone: 'Pacific/Auckland' }, hostLinks: ['mine'] }));
  rerender({
    value: { ...initial, timing: { day: '2029-01-03', zone: 'UTC' }, hostLinks: ['foreign'] },
  });
  expect(result.current.draft.timing).toEqual({ zone: 'Pacific/Auckland' });
  expect(result.current.draft.hostLinks).toEqual(['mine']);
  expect(result.current.conflict).toBe(true);
  await act(async () => {
    await result.current.commit({ hostLinks: ['mine'] });
  });
  expect(save).not.toHaveBeenCalled();
});

it('invalidates a whole-source inverse on a foreign refresh, including a previously captured Undo callback', async () => {
  const changed = { ...initial, address: 'New address', revision: 1 };
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>().mockResolvedValue(changed);
  const { result, rerender } = setup(save);
  await act(async () => {
    await result.current.commit({ address: 'New address' });
  });
  const undo = result.current.undo;
  rerender({ value: { ...changed, hostLinks: ['original', 'foreign'], revision: 2 } });
  expect(result.current.canUndo).toBe(false);
  await act(async () => {
    await undo();
    await result.current.undo();
  });
  expect(save).toHaveBeenCalledTimes(1);
});

it('retains a failed inverse baseline and blocks its retry after a foreign revision changes an inverse field', async () => {
  const changed = { ...initial, address: 'New address', revision: 1 };
  const save = vi
    .fn<(patch: Patch, saved: Source) => Promise<Source>>()
    .mockResolvedValueOnce(changed)
    .mockRejectedValueOnce(new Error('Unavailable'));
  const { result, rerender } = setup(save);
  await act(async () => {
    await result.current.commit({ address: 'New address' });
  });
  await act(async () => {
    await result.current.undo();
  });
  const retry = result.current.retry;
  rerender({ value: { ...changed, hostLinks: ['original', 'foreign'], revision: 2 } });
  expect(result.current.conflict).toBe(true);
  expect(result.current.draft.hostLinks).toEqual(initial.hostLinks);
  await act(async () => {
    await retry();
  });
  expect(save.mock.calls).toEqual([
    [{ address: 'New address' }, initial],
    [source(initial), changed],
  ]);
});

it('processes a canonical read received during a failed write after the write settles', async () => {
  let reject: ((error: Error) => void) | undefined;
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>(
    () =>
      new Promise((_resolve, rejectWrite) => {
        reject = rejectWrite;
      })
  );
  const { result, rerender } = setup(save);
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.commit({ address: 'New address' });
  });
  const fresh = { ...initial, hostLinks: ['original', 'foreign'], revision: 1 };
  rerender({ value: fresh });
  expect(result.current.busy).toBe(true);
  await act(async () => {
    reject?.(new Error('Unavailable'));
    await pending;
  });
  expect(result.current.saved).toEqual(fresh);
  expect(result.current.draft).toEqual({ ...fresh, address: 'New address' });
  expect(result.current.conflict).toBe(false);
  expect(result.current.failure).toBeDefined();
});

it('blocks an overlapping canonical update observed during a failed write', async () => {
  let reject: ((error: Error) => void) | undefined;
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>(
    () =>
      new Promise((_resolve, rejectWrite) => {
        reject = rejectWrite;
      })
  );
  const { result, rerender } = setup(save);
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.commit({ hostLinks: ['mine'] });
  });
  rerender({ value: { ...initial, hostLinks: ['original', 'foreign'] } });
  await act(async () => {
    reject?.(new Error('Unavailable'));
    await pending;
  });
  expect(result.current.conflict).toBe(true);
  await act(async () => {
    await result.current.retry();
  });
  expect(save).toHaveBeenCalledTimes(1);
});

it('does not let a read observed before a successful response replace the confirmed write or its Undo', async () => {
  let resolve: ((value: Source) => void) | undefined;
  const changed = { ...initial, address: 'Saved address', revision: 2 };
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>(
    () =>
      new Promise((resolveWrite) => {
        resolve = resolveWrite;
      })
  );
  const { result, rerender } = setup(save);
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.commit({ address: changed.address });
  });
  rerender({ value: { ...initial, address: 'Stale in-flight read', revision: 1 } });
  await act(async () => {
    resolve?.(changed);
    await pending;
  });
  expect(result.current.saved).toEqual(changed);
  expect(result.current.draft).toEqual(changed);
  expect(result.current.canUndo).toBe(true);
  rerender({ value: { ...changed } });
  expect(result.current.canUndo).toBe(true);
  expect(result.current.conflict).toBe(false);
});

it('preserves conflicting untouched foreign facts seen during a successful write without inventing a saved acknowledgement', async () => {
  let resolve: ((value: Source) => void) | undefined;
  const changed = { ...initial, address: 'Saved address', revision: 2 };
  const foreign = { ...initial, hostLinks: ['original', 'foreign'], revision: 1 };
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>(
    () =>
      new Promise((resolveWrite) => {
        resolve = resolveWrite;
      })
  );
  const { result, rerender } = setup(save);
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.commit({ address: changed.address });
  });
  rerender({ value: foreign });
  await act(async () => {
    resolve?.(changed);
    await pending;
  });
  expect(result.current.saved).toEqual(changed);
  expect(result.current.draft).toEqual({ ...changed, hostLinks: foreign.hostLinks });
  expect(result.current.conflict).toBe(true);
  expect(result.current.canUndo).toBe(false);
  await act(async () => {
    await result.current.commit({ hostLinks: ['replacement'] });
  });
  expect(save).toHaveBeenCalledTimes(1);
});

it('clears unsafe inverse history when a successful response confirms an untouched foreign update seen while busy', async () => {
  let resolve: ((value: Source) => void) | undefined;
  const foreign = { ...initial, hostLinks: ['original', 'foreign'], revision: 1 };
  const changed = { ...foreign, address: 'Saved address', revision: 2 };
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>(
    () =>
      new Promise((resolveWrite) => {
        resolve = resolveWrite;
      })
  );
  const { result, rerender } = setup(save);
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.commit({ address: changed.address });
  });
  rerender({ value: foreign });
  await act(async () => {
    resolve?.(changed);
    await pending;
  });
  expect(result.current.saved).toEqual(changed);
  expect(result.current.draft).toEqual(changed);
  expect(result.current.conflict).toBe(false);
  expect(result.current.canUndo).toBe(false);
  await act(async () => {
    await result.current.undo();
  });
  expect(save).toHaveBeenCalledTimes(1);
});

it('resolves only overlapping fields while preserving an unrelated failed address and its retry revision', async () => {
  const foreign = { ...initial, hostLinks: ['original', 'foreign'], revision: 1 };
  const changed = { ...foreign, address: 'Pending address', revision: 2 };
  const save = vi
    .fn<(patch: Patch, saved: Source) => Promise<Source>>()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockResolvedValueOnce(changed);
  const { result, rerender } = setup(save);
  await act(async () => {
    await result.current.commit({ address: 'Pending address', hostLinks: ['mine'] });
  });
  rerender({ value: foreign });
  expect(result.current.conflict).toBe(true);
  act(() => result.current.reset());
  expect(result.current.conflict).toBe(false);
  expect(result.current.draft).toEqual({ ...foreign, address: 'Pending address' });
  expect(result.current.failure?.patch).toEqual({ address: 'Pending address' });
  await act(async () => {
    await result.current.retry();
  });
  expect(save.mock.calls[1]).toEqual([{ address: 'Pending address' }, initial]);
});

it('does not treat an unchanged prewrite prop as a foreign update after an earlier successful write', async () => {
  const first = { ...initial, address: 'Saved address', revision: 1 };
  const second = { ...first, hostLinks: ['replacement'], revision: 2 };
  const save = vi
    .fn<(patch: Patch, saved: Source) => Promise<Source>>()
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
  const { result } = setup(save);
  await act(async () => {
    await result.current.commit({ address: first.address });
  });
  await act(async () => {
    await result.current.commit({ hostLinks: second.hostLinks });
  });
  expect(result.current.draft).toEqual(second);
  expect(result.current.conflict).toBe(false);
  expect(result.current.canUndo).toBe(true);
});

it('preserves unrelated unsaved fields across a successful source write and a no-op commit', async () => {
  const changed = { ...initial, hostLinks: ['replacement'], revision: 1 };
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>().mockResolvedValue(changed);
  const { result } = setup(save);
  act(() => result.current.edit({ address: 'Pending address' }));
  await act(async () => {
    await result.current.commit({ hostLinks: changed.hostLinks });
  });
  expect(result.current.saved).toEqual(changed);
  expect(result.current.draft).toEqual({ ...changed, address: 'Pending address' });
  expect(result.current.dirty).toBe(true);
  await act(async () => {
    await result.current.commit({ hostLinks: changed.hostLinks });
  });
  expect(result.current.draft.address).toBe('Pending address');
  expect(save).toHaveBeenCalledTimes(1);
});

it('retains a local dirty field and blocks its conflicting foreign update observed during another successful write', async () => {
  let resolve: ((value: Source) => void) | undefined;
  const foreign = { ...initial, address: 'Foreign address', revision: 1 };
  const changed = { ...foreign, hostLinks: ['replacement'], revision: 2 };
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>(
    () =>
      new Promise((resolveWrite) => {
        resolve = resolveWrite;
      })
  );
  const { result, rerender } = setup(save);
  act(() => result.current.edit({ address: 'Pending address' }));
  let pending: Promise<void> | undefined;
  act(() => {
    pending = result.current.commit({ hostLinks: changed.hostLinks });
  });
  rerender({ value: foreign });
  await act(async () => {
    resolve?.(changed);
    await pending;
  });
  expect(result.current.saved).toEqual(changed);
  expect(result.current.draft.address).toBe('Pending address');
  expect(result.current.conflict).toBe(true);
  act(() => result.current.reset());
  expect(result.current.draft.address).toBe('Foreign address');
});

it('does not turn a converging foreign read into a fake acknowledgement of a failed revision-guarded operation', async () => {
  const foreign = { ...initial, address: 'Pending address', revision: 1 };
  const save = vi
    .fn<(patch: Patch, saved: Source) => Promise<Source>>()
    .mockRejectedValueOnce(new Error('Unavailable'))
    .mockRejectedValueOnce(new Error('Revision mismatch'));
  const { result, rerender } = setup(save);
  await act(async () => {
    await result.current.commit({ address: 'Pending address' });
  });
  rerender({ value: foreign });
  expect(result.current.conflict).toBe(false);
  expect(result.current.failure).toBeDefined();
  await act(async () => {
    await result.current.retry();
  });
  expect(save.mock.calls[1]).toEqual([{ address: 'Pending address' }, initial]);
  expect(result.current.failure?.error).toEqual(new Error('Revision mismatch'));
});

it('blocks a previously captured whole-source inverse while unrelated local changes remain pending', async () => {
  const changed = { ...initial, hostLinks: ['replacement'], revision: 1 };
  const save = vi.fn<(patch: Patch, saved: Source) => Promise<Source>>().mockResolvedValue(changed);
  const { result } = setup(save);
  await act(async () => {
    await result.current.commit({ hostLinks: changed.hostLinks });
  });
  const undo = result.current.undo;
  act(() => result.current.edit({ address: 'Pending address' }));
  expect(result.current.canUndo).toBe(false);
  await act(async () => {
    await undo();
  });
  expect(save).toHaveBeenCalledTimes(1);
  expect(result.current.draft.address).toBe('Pending address');
});
