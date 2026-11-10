import { act, renderHook } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { useSourceEditor } from './useSourceEditor';

type Source = { value: string; revision: number };
type Patch = Partial<Pick<Source, 'value'>>;

it('passes the exact confirmed baseline to forward, retry and inverse writes across its own successors', async () => {
  const initial: Source = { value: 'Original', revision: 0 };
  const first: Source = { value: 'First', revision: 1 };
  const second: Source = { value: 'Second', revision: 2 };
  const inverse: Source = { value: 'First', revision: 3 };
  const save = vi
    .fn<(patch: Patch, saved: Source) => Promise<Source>>()
    .mockResolvedValueOnce(first)
    .mockRejectedValueOnce(new Error('Write unavailable'))
    .mockResolvedValueOnce(second)
    .mockResolvedValueOnce(inverse)
    .mockResolvedValueOnce({ value: 'Original', revision: 4 });
  const { result } = renderHook(() =>
    useSourceEditor(initial, {
      source: ({ value }: Source): Patch => ({ value }),
      save,
      onSaved: vi.fn(),
    })
  );
  await act(async () => {
    await result.current.commit({ value: 'First' });
  });
  await act(async () => {
    await result.current.commit({ value: 'Second' });
  });
  expect(result.current.failure).toBeDefined();
  await act(async () => {
    await result.current.retry();
  });
  await act(async () => {
    await result.current.undo();
  });
  await act(async () => {
    await result.current.undo();
  });
  expect(save.mock.calls).toEqual([
    [{ value: 'First' }, initial],
    [{ value: 'Second' }, first],
    [{ value: 'Second' }, first],
    [{ value: 'First' }, second],
    [{ value: 'Original' }, inverse],
  ]);
  expect(result.current.saved).toEqual({ value: 'Original', revision: 4 });
  expect(result.current.canUndo).toBe(false);
});
