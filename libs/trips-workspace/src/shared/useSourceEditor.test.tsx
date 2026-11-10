import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useSourceEditor } from './useSourceEditor';

interface Source {
  name: string | null;
  timing: { day?: string; zone?: string };
  notes: string;
}
type Patch = Partial<Source>;
const initial: Source = {
  name: 'Source',
  timing: { day: '2029-01-02', zone: 'Pacific/Auckland' },
  notes: '',
};
afterEach(cleanup);

describe('Shared direct source editor', () => {
  it('retains omission, explicit null and whole-object replacement through persisted edits and Undo', async () => {
    const cleared = { ...initial, name: null };
    const retimed = { ...cleared, timing: { zone: 'UTC' } };
    const save = vi
      .fn<(patch: Patch) => Promise<Source>>()
      .mockResolvedValueOnce(cleared)
      .mockResolvedValueOnce(retimed)
      .mockResolvedValueOnce(cleared);
    const { result } = renderHook(() =>
      useSourceEditor<Source, Patch>(initial, { source: (value) => value, save, onSaved: vi.fn() })
    );
    await act(async () => {
      await result.current.commit({ name: null });
    });
    expect(result.current.draft.name).toBeNull();
    expect(result.current.draft.timing).toEqual(initial.timing);
    await act(async () => {
      await result.current.commit({ timing: { zone: 'UTC' } });
    });
    expect(result.current.draft.timing).toEqual({ zone: 'UTC' });
    await act(async () => {
      await result.current.undo();
    });
    expect(save.mock.calls.map(([patch]) => patch)).toEqual([
      { name: null },
      { timing: { zone: 'UTC' } },
      cleared,
    ]);
    expect(result.current.draft).toEqual(cleared);
    expect(result.current.canUndo).toBe(true);
  });

  it('keeps successful history across a mutation echo and retains a failed Undo for exact retry', async () => {
    const changed = { ...initial, name: 'Edited' };
    const failure = new Error('refused');
    const save = vi
      .fn<(patch: Patch) => Promise<Source>>()
      .mockResolvedValueOnce(changed)
      .mockRejectedValueOnce(failure)
      .mockResolvedValueOnce(initial);
    const { result, rerender } = renderHook(
      ({ value }) =>
        useSourceEditor<Source, Patch>(value, {
          source: (source) => source,
          save,
          onSaved: vi.fn(),
        }),
      { initialProps: { value: initial } }
    );
    await act(async () => {
      await result.current.commit({ name: 'Edited' });
    });
    rerender({ value: changed });
    expect(result.current.canUndo).toBe(true);
    await act(async () => {
      await result.current.undo();
    });
    expect(result.current.saved).toEqual(changed);
    expect(result.current.draft).toEqual(initial);
    expect(result.current.failure).toEqual({ patch: initial, undo: true, error: failure });
    expect(result.current.canUndo).toBe(false);
    await act(async () => {
      await result.current.retry();
    });
    expect(save.mock.calls.map(([patch]) => patch)).toEqual([{ name: 'Edited' }, initial, initial]);
    expect(result.current.saved).toEqual(initial);
    expect(result.current.failure).toBeUndefined();
    expect(result.current.canUndo).toBe(false);
  });

  it('protects failed edits from fresh reads and merges a corrected field without losing other failed fields', async () => {
    const changed = { ...initial, name: 'Retry name', notes: 'New note' };
    const save = vi
      .fn<(patch: Patch) => Promise<Source>>()
      .mockRejectedValueOnce(new Error('refused'))
      .mockResolvedValueOnce(changed);
    const { result, rerender } = renderHook(
      ({ value }) =>
        useSourceEditor<Source, Patch>(value, {
          source: (source) => source,
          save,
          onSaved: vi.fn(),
        }),
      { initialProps: { value: initial } }
    );
    await act(async () => {
      await result.current.commit({ name: 'Retry name' });
    });
    rerender({ value: { ...initial, name: 'Fresh read' } });
    expect(result.current.draft.name).toBe('Retry name');
    await act(async () => {
      await result.current.commit({ notes: 'New note' });
    });
    expect(save.mock.calls.map(([patch]) => patch)).toEqual([
      { name: 'Retry name' },
      { name: 'Retry name', notes: 'New note' },
    ]);
    expect(result.current.draft).toEqual(changed);
  });

  it('accepts an untouched fresh source, but never overwrites an unsaved draft or writes a no-op', async () => {
    const save = vi.fn<(patch: Patch) => Promise<Source>>();
    const { result, rerender } = renderHook(
      ({ value }) =>
        useSourceEditor<Source, Patch>(value, {
          source: (source) => source,
          save,
          onSaved: vi.fn(),
        }),
      { initialProps: { value: initial } }
    );
    const fresh = { ...initial, name: 'Fresh read' };
    rerender({ value: fresh });
    expect(result.current.draft.name).toBe('Fresh read');
    act(() => result.current.edit({ notes: 'Uncommitted' }));
    rerender({ value: { ...initial, name: 'Background read' } });
    expect(result.current.draft).toEqual({ ...fresh, notes: 'Uncommitted' });
    expect(result.current.dirty).toBe(true);
    await act(async () => {
      await result.current.commit({ notes: fresh.notes });
    });
    expect(save).not.toHaveBeenCalled();
    expect(result.current.dirty).toBe(false);
  });
});
