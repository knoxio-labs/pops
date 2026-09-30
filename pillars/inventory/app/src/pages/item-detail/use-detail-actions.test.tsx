import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { coreItem, coreWorld } from '../../foundation/test-fixtures/core';

const mocks = vi.hoisted(() => ({
  itemVerbs: {
    move: vi.fn(),
    pickUp: vi.fn(),
    putBack: vi.fn(),
    restore: vi.fn(),
    setAccess: vi.fn(),
    setFull: vi.fn(),
    setLifecycle: vi.fn(),
    setQuantity: vi.fn(),
    split: vi.fn(),
  },
  showUndoToast: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock('../../inventory-web/item-verbs', () => ({
  useItemVerbs: () => mocks.itemVerbs,
}));

vi.mock('../../foundation/feedback/undo-toast', () => ({
  showUndoToast: (...args: unknown[]) => mocks.showUndoToast(...args),
}));

vi.mock('sonner', () => ({
  toast: { success: (...args: unknown[]) => mocks.toastSuccess(...args) },
}));

import { useDetailActions } from './use-detail-actions';

function appliedResult() {
  return {
    status: 'applied' as const,
    seq: 4,
    undo: vi.fn(async () => undefined),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return <MemoryRouter initialEntries={['/inventory/items/itm-drill']}>{children}</MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.values(mocks.itemVerbs).forEach((verb) => verb.mockResolvedValue(appliedResult()));
});

describe('useDetailActions', () => {
  it('runs Pick up and offers Undo for an applied header verb', async () => {
    const { result } = renderHook(
      () => useDetailActions({ item: coreItem('itm-drill'), world: coreWorld }, null, false),
      { wrapper }
    );

    await act(async () => {
      const primary = result.current.verbs.primary;
      if (primary === null) throw new Error('expected a primary verb');
      result.current.onVerb(primary);
      await waitFor(() => expect(mocks.itemVerbs.pickUp).toHaveBeenCalledWith('itm-drill'));
    });

    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        concept: 'pickUp',
        message: 'Picked up Cordless drill',
      })
    );
  });

  it('keeps a refused mutation inline and does not show an Undo toast', async () => {
    mocks.itemVerbs.pickUp.mockResolvedValueOnce({
      status: 'refused',
      refusal: {
        kind: 'outcome',
        outcome: { status: 'rejected', reason: 'The item is locked.' },
      },
    });
    const { result } = renderHook(
      () => useDetailActions({ item: coreItem('itm-drill'), world: coreWorld }, null, false),
      { wrapper }
    );

    const primary = result.current.verbs.primary;
    if (primary === null) throw new Error('expected a primary verb');
    act(() => result.current.onVerb(primary));
    await waitFor(() => expect(result.current.refusal).toBe('The item is locked.'));

    expect(mocks.showUndoToast).not.toHaveBeenCalled();
  });

  it('opens the picker for Move and mutates in place after a destination is picked', async () => {
    const { result } = renderHook(
      () => useDetailActions({ item: coreItem('itm-drill'), world: coreWorld }, null, false),
      { wrapper }
    );
    const move = result.current.verbs.secondary[0];
    if (move === undefined || move.id !== 'move') throw new Error('expected Move');

    act(() => result.current.onVerb(move));
    expect(result.current.pickerOpen).toBe(true);

    await act(async () => {
      result.current.onPick({ kind: 'location', locationId: 'loc-garage' });
      await waitFor(() =>
        expect(mocks.itemVerbs.move).toHaveBeenCalledWith('itm-drill', {
          kind: 'location',
          locationId: 'loc-garage',
        })
      );
    });

    expect(result.current.pickerOpen).toBe(false);
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Moved Cordless drill to Garage' })
    );
  });

  it('runs dialog lifecycle outcomes and keeps Destroy without an Undo toast', async () => {
    const { result } = renderHook(
      () => useDetailActions({ item: coreItem('itm-drill'), world: coreWorld }, null, false),
      { wrapper }
    );

    await act(async () => {
      result.current.onDone({ dialog: 'retire', reason: 'Replaced' });
      await waitFor(() =>
        expect(mocks.itemVerbs.setLifecycle).toHaveBeenCalledWith(
          'itm-drill',
          'retired',
          'Replaced'
        )
      );
    });
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'retired', message: 'Retired Cordless drill' })
    );

    mocks.showUndoToast.mockClear();
    await act(async () => {
      result.current.onDone({ dialog: 'destroy', reason: 'Recycled' });
      await waitFor(() =>
        expect(mocks.itemVerbs.setLifecycle).toHaveBeenCalledWith(
          'itm-drill',
          'destroyed',
          'Recycled'
        )
      );
    });
    expect(mocks.showUndoToast).not.toHaveBeenCalled();
  });

  it('returns false at both ends of a missing trail and ignores offline verbs', () => {
    const { result } = renderHook(
      () =>
        useDetailActions(
          { item: coreItem('itm-drill'), world: coreWorld },
          {
            listName: 'Items',
            href: '/inventory/items',
            index: 0,
            total: 1,
            previousId: null,
            nextId: null,
          },
          true
        ),
      { wrapper }
    );

    const previous = result.current.keyHandlers['detail-previous'];
    const next = result.current.keyHandlers['detail-next'];
    expect(previous?.(new KeyboardEvent('keydown'))).toBe(false);
    expect(next?.(new KeyboardEvent('keydown'))).toBe(false);

    const primary = result.current.verbs.primary;
    if (primary === null) throw new Error('expected a primary verb');
    act(() => result.current.onVerb(primary));
    expect(mocks.itemVerbs.pickUp).not.toHaveBeenCalled();
  });

  it('opens the new-item form seeded from this item for Duplicate', () => {
    const { result } = renderHook(
      () => ({
        actions: useDetailActions({ item: coreItem('itm-drill'), world: coreWorld }, null, false),
        location: useLocation(),
      }),
      { wrapper }
    );

    const duplicate = result.current.actions.verbs.menu
      .flat()
      .find((entry) => entry.id === 'duplicate');
    if (duplicate === undefined) throw new Error('expected a Duplicate entry');
    act(() => result.current.actions.onMenu(duplicate));

    expect(result.current.location.pathname).toBe('/inventory/items/new');
    expect(result.current.location.search).toBe('?from=itm-drill');
  });
});
