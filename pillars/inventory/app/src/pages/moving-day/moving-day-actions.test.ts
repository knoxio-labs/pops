import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InventoryApiError } from '../../inventory-api-helpers.js';
import {
  actionDisabledReason,
  actionLabel,
  actionMessage,
  actionsFor,
  mutationFor,
  refusalMessage,
  useMovingDayActions,
} from './moving-day-actions.js';
import { movingData, worldForMovingData } from './moving-day-test-fixtures.js';

const mocks = vi.hoisted(() => ({
  single: {
    setAccess: vi.fn(),
    setFull: vi.fn(),
  },
  bulk: {
    move: vi.fn(),
    store: vi.fn(),
  },
  pending: vi.fn(),
  showUndoToast: vi.fn(),
}));

vi.mock('../../inventory-web/item-verbs.js', () => ({
  useItemVerbs: () => mocks.single,
  usePendingItemIds: () => mocks.pending(),
}));
vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: () => mocks.bulk,
}));
vi.mock('../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));

describe('moving-day-actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.pending.mockReturnValue(new Set<string>());
    mocks.single.setFull.mockResolvedValue({
      status: 'applied',
      seq: 1,
      undo: vi.fn().mockResolvedValue(undefined),
    });
    mocks.single.setAccess.mockResolvedValue({
      status: 'applied',
      seq: 2,
      undo: vi.fn().mockResolvedValue(undefined),
    });
    mocks.bulk.move.mockResolvedValue({ applied: ['item'], refused: [], undo: null });
    mocks.bulk.store.mockResolvedValue({ applied: ['item'], refused: [], undo: null });
  });

  it('exposes the next reversible verbs for each stage', () => {
    expect(actionsFor('packing')).toEqual(['mark-full', 'close']);
    expect(actionsFor('full')).toEqual(['close', 'open']);
    expect(actionsFor('closed')).toEqual(['open']);
  });

  it('maps labels, mutations, and undo copy without guessing at server state', () => {
    expect(actionLabel('open', 'full')).toBe('Not full');
    expect(actionLabel('open', 'closed')).toBe('Reopen');
    expect(mutationFor('full', 'open')).toEqual({ kind: 'full', value: false });
    expect(mutationFor('closed', 'open')).toEqual({ kind: 'access', value: 'open' });
    expect(actionMessage('close', 'Kitchen 01', 'packing')).toBe('Closed Kitchen 01');
    expect(actionMessage('open', 'Kitchen 01', 'full')).toBe('Marked Kitchen 01 not full');
  });

  it('explains offline and unavailable placement states', () => {
    expect(actionDisabledReason(false, true)).toBe(
      'No connection. Changes are off until it is back.'
    );
    expect(actionDisabledReason(true, false)).toBe('Loading item placements.');
    expect(actionDisabledReason(true, true)).toBeUndefined();
  });

  it('keeps server refusals visible instead of treating them as success', () => {
    expect(
      refusalMessage({
        kind: 'outcome',
        outcome: {
          status: 'rejected',
          message: 'Box is already closed',
          mutationId: 'mutation-1',
          reason: 'closed',
        },
      })
    ).toBe('Box is already closed');
    expect(
      refusalMessage({ kind: 'failed', error: new InventoryApiError('offline', undefined) })
    ).toBe('The inventory service did not answer.');
    expect(refusalMessage({ kind: 'no-previous-place' })).toBe(
      'This item has no remembered place.'
    );
  });

  it('runs typed stage and packing verbs and preserves refusals in page state', async () => {
    const data = movingData();
    const box = data.boxes[0]!;
    const { result } = renderHook(() =>
      useMovingDayActions({ online: true, ready: true, world: worldForMovingData(data) })
    );

    act(() => result.current.onBoxAction(box, 'mark-full'));
    await waitFor(() => expect(mocks.single.setFull).toHaveBeenCalledWith(box.id, true));

    act(() => result.current.onPack(['item'], { kind: 'container', containerId: box.id }));
    await waitFor(() =>
      expect(mocks.bulk.store).toHaveBeenCalledWith(['item'], {
        kind: 'container',
        containerId: box.id,
      })
    );

    mocks.single.setAccess.mockResolvedValue({
      status: 'refused',
      refusal: {
        kind: 'outcome',
        outcome: {
          status: 'rejected',
          message: 'Already closed',
          mutationId: 'mutation-2',
          reason: 'closed',
        },
      },
    });
    act(() => result.current.onBoxAction(box, 'close'));
    await waitFor(() => expect(result.current.rejections[box.id]).toBe('Already closed'));
  });
});
