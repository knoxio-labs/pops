import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { at, box, inBox, item } from '../test-fixtures/core-factory.js';

import type { BulkResult } from '../../inventory-web/item-verbs-bulk.js';
import type { PlacementWorld } from '../model/placement-model.js';

const mocks = vi.hoisted(() => ({
  move: vi.fn(),
  pickUp: vi.fn(),
  setLifecycle: vi.fn(),
  track: vi.fn(),
  runTakeOut: vi.fn(),
  navigate: vi.fn(),
  showUndoToast: vi.fn(),
  toastError: vi.fn(),
  rejections: { lamp: 'The old place is gone.' } as Readonly<Record<string, string>>,
}));

vi.mock('../../inventory-web/item-verbs-bulk.js', () => ({
  useBulkItemVerbs: () => ({
    move: mocks.move,
    store: vi.fn(),
    pickUp: mocks.pickUp,
    putBack: vi.fn(),
    setAccess: vi.fn(),
    setLifecycle: mocks.setLifecycle,
    changeType: vi.fn(),
    editValues: vi.fn(),
  }),
}));
vi.mock('../../inventory-web/item-verbs.js', () => ({
  usePendingItemIds: () => new Set<string>(),
}));
vi.mock('../list-page/take-out.js', () => ({
  useTrackedWrites: () => ({
    rejections: mocks.rejections,
    track: mocks.track,
    setRejection: vi.fn(),
  }),
  runTakeOut: mocks.runTakeOut,
}));
vi.mock('../feedback/undo-toast.js', () => ({ showUndoToast: mocks.showUndoToast }));
vi.mock('react-router', () => ({ useNavigate: () => mocks.navigate }));
vi.mock('sonner', () => ({ toast: { error: mocks.toastError } }));

import { labelsHref, MAX_LABEL_IDS } from '../../pages/labels-page/label-params.js';
import { useContentsVerbs } from './use-contents-verbs.js';

function result(applied: string[] = ['lamp']): BulkResult {
  return { applied, refused: [], undo: vi.fn(async () => undefined) };
}

function world(): PlacementWorld {
  return buildWorld(
    [
      box(['outer', 'Outer box', 'box-type'], at('garage'), 'open'),
      item(['one', 'One', null], inBox('outer')),
      item(['two', 'Two', null], inBox('outer')),
      item(['three', 'Three', null], inBox('outer')),
      item(['lamp', 'Lamp', null], at('garage')),
    ],
    [
      { id: 'garage', name: 'Garage', parentId: null, kind: 'property' },
      { id: 'shelf', name: 'Shelf', parentId: 'garage', kind: 'storage' },
    ]
  );
}

describe('useContentsVerbs', () => {
  beforeEach(() => {
    mocks.move.mockReset();
    mocks.pickUp.mockReset();
    mocks.setLifecycle.mockReset();
    mocks.track.mockReset();
    mocks.runTakeOut.mockReset();
    mocks.navigate.mockReset();
    mocks.showUndoToast.mockReset();
    mocks.toastError.mockReset();
    mocks.track.mockImplementation(
      async (_ids: readonly string[], run: () => Promise<BulkResult>) => run()
    );
    mocks.move.mockResolvedValue(result(['outer']));
    mocks.pickUp.mockResolvedValue(result(['lamp']));
    mocks.setLifecycle.mockResolvedValue(result(['lamp']));
    mocks.runTakeOut.mockResolvedValue({ applied: ['one'], undo: vi.fn(async () => undefined) });
  });

  it('moveTo sends the plan ids and counts carried contents in the message', async () => {
    const current = world();
    const { result: hook } = renderHook(() => useContentsVerbs({ world: current, offline: false }));

    act(() => hook.current.startMove(['outer']));
    act(() => hook.current.moveTo({ kind: 'location', locationId: 'shelf' }, current));

    await waitFor(() =>
      expect(mocks.move).toHaveBeenCalledWith(['outer'], {
        kind: 'location',
        locationId: 'shelf',
      })
    );
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'move', message: 'Moved 4 things to Shelf' })
    );
    expect(hook.current.moving).toBeNull();
  });

  it('picks up items and says Picked up with the affected count', async () => {
    const current = world();
    const { result: hook } = renderHook(() => useContentsVerbs({ world: current, offline: false }));

    act(() => hook.current.pickUp(['lamp']));

    await waitFor(() => expect(mocks.pickUp).toHaveBeenCalledWith(['lamp']));
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'pickUp', message: 'Picked up 1 thing' })
    );
  });

  it('runs Take out through the shared runner and shows one Undo toast', async () => {
    const current = world();
    const { result: hook } = renderHook(() => useContentsVerbs({ world: current, offline: false }));

    act(() => hook.current.takeOut(['one']));

    await waitFor(() =>
      expect(mocks.runTakeOut).toHaveBeenCalledWith(
        expect.objectContaining({ world: current, ids: ['one'], track: mocks.track })
      )
    );
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'takeOut', message: 'Took 1 thing out' })
    );
  });

  it('opens labels for an allowed selection and refuses an oversized one', () => {
    const current = world();
    const { result: hook } = renderHook(() => useContentsVerbs({ world: current, offline: false }));
    const allowed = ['lamp'];
    const oversized = Array.from({ length: MAX_LABEL_IDS + 1 }, (_, index) => `item-${index}`);

    act(() => hook.current.label(allowed));
    expect(mocks.navigate).toHaveBeenCalledWith(labelsHref(allowed));

    mocks.navigate.mockClear();
    act(() => hook.current.label(oversized));
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(hook.current.keyHandlersFor(oversized).label?.(new KeyboardEvent('keydown'))).toBe(
      false
    );
  });

  it('sends one lifecycle reason for the selected ids and offers Undo', async () => {
    const current = world();
    const { result: hook } = renderHook(() => useContentsVerbs({ world: current, offline: false }));

    act(() => hook.current.startLifecycle('retire', ['lamp']));
    expect(hook.current.lifecycle).toEqual({ act: 'retire', ids: ['lamp'] });
    act(() => hook.current.confirmLifecycle('Broken'));

    await waitFor(() =>
      expect(mocks.setLifecycle).toHaveBeenCalledWith(['lamp'], 'retired', 'Broken')
    );
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'retired', message: 'Retired 1 thing' })
    );
    expect(hook.current.lifecycle).toBeNull();
  });

  it('returns tracked refusals and keeps offline verbs inert', () => {
    const current = world();
    const { result: hook } = renderHook(() => useContentsVerbs({ world: current, offline: true }));

    expect(hook.current.rejections).toBe(mocks.rejections);
    act(() => {
      hook.current.pickUp(['lamp']);
      hook.current.startMove(['lamp']);
      hook.current.startLifecycle('discard', ['lamp']);
    });
    expect(hook.current.moving).toBeNull();
    expect(hook.current.lifecycle).toBeNull();
    expect(mocks.pickUp).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
    expect(mocks.setLifecycle).not.toHaveBeenCalled();
  });
});
