import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildWorld } from '../model/placement-model.js';
import { item, at } from '../test-fixtures/core-factory.js';

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  rename: vi.fn(),
  move: vi.fn(),
  remove: vi.fn(),
  showUndoToast: vi.fn(),
  toast: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('../../inventory-web/usePlaceMutations.js', () => ({
  usePlaceMutations: () => ({
    create: mocks.create,
    rename: mocks.rename,
    move: mocks.move,
    arrange: vi.fn(),
    remove: mocks.remove,
  }),
}));
vi.mock('../feedback/undo-toast.js', () => ({ showUndoToast: mocks.showUndoToast }));
vi.mock('sonner', () => ({
  toast: Object.assign(mocks.toast, { error: mocks.toastError }),
}));

import { planDelete } from './delete-plan.js';
import { usePlaceEdits } from './use-place-edits.js';

import type { LocationModel } from '../model/model.js';

const place = (id: string, name: string, parentId: string | null = null): LocationModel => ({
  id,
  name,
  parentId,
  kind: parentId === null ? 'property' : 'room',
});

function world() {
  return buildWorld(
    [item(['lamp', 'Lamp', null], at('garage'))],
    [
      place('home', 'Home'),
      place('garage', 'Garage', 'home'),
      place('office', 'Office', 'home'),
      place('yard', 'Yard'),
    ]
  );
}

describe('usePlaceEdits', () => {
  beforeEach(() => {
    mocks.create.mockReset();
    mocks.rename.mockReset();
    mocks.move.mockReset();
    mocks.remove.mockReset();
    mocks.showUndoToast.mockReset();
    mocks.toast.mockReset();
    mocks.toastError.mockReset();
    mocks.create.mockResolvedValue({ id: 'new-place', undo: vi.fn(async () => undefined) });
    mocks.rename.mockResolvedValue({ undo: vi.fn(async () => undefined) });
    mocks.move.mockResolvedValue({ undo: vi.fn(async () => undefined) });
    mocks.remove.mockResolvedValue(undefined);
  });

  it('returns a name clash without sending it', () => {
    const { result } = renderHook(() =>
      usePlaceEdits({ world: world(), offline: false, onDeleted: vi.fn() })
    );

    act(() => result.current.startRename('garage'));
    let problem: string | null = null;
    act(() => {
      problem = result.current.commitRename('office');
    });

    expect(problem).toBe('Home already has a place called Office.');
    expect(mocks.rename).not.toHaveBeenCalled();
  });

  it('sends trimmed rename and offers Undo', async () => {
    const current = world();
    const { result } = renderHook(() =>
      usePlaceEdits({ world: current, offline: false, onDeleted: vi.fn() })
    );

    act(() => result.current.startRename('garage'));
    expect(result.current.commitRename('  Workshop ')).toBeNull();
    await waitFor(() => expect(mocks.rename).toHaveBeenCalledWith('garage', 'Workshop'));
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({
        concept: 'location',
        message: 'Renamed Garage to Workshop',
      })
    );
  });

  it('creates under the selected parent and reports the new id', async () => {
    const onCreated = vi.fn();
    const { result } = renderHook(() =>
      usePlaceEdits({ world: world(), offline: false, onCreated, onDeleted: vi.fn() })
    );

    act(() => result.current.startCreate('home'));
    expect(result.current.commitCreate('  Study ')).toBeNull();
    await waitFor(() => expect(mocks.create).toHaveBeenCalledWith('Study', 'home'));
    expect(onCreated).toHaveBeenCalledWith('new-place');
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ concept: 'location', message: 'Added Study' })
    );
  });

  it('moves only when the placement verdict allows it', async () => {
    const current = world();
    const { result } = renderHook(() =>
      usePlaceEdits({ world: current, offline: false, onDeleted: vi.fn() })
    );

    act(() => result.current.moveTo('garage', null));
    await waitFor(() => expect(mocks.move).toHaveBeenCalledWith('garage', null));
    expect(mocks.showUndoToast).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Moved Garage to the top level' })
    );

    mocks.move.mockClear();
    act(() => result.current.moveTo('garage', 'garage'));
    expect(mocks.move).not.toHaveBeenCalled();
  });

  it('defaults delete mode by parent and sends an accepted plan', async () => {
    const current = world();
    const onDeleted = vi.fn();
    const { result } = renderHook(() =>
      usePlaceEdits({ world: current, offline: false, onDeleted })
    );

    act(() => result.current.requestDelete('garage'));
    expect(result.current.deleting).toEqual({ placeId: 'garage', mode: 'reparent' });
    const plan = planDelete(current, 'garage', 'reparent');
    act(() => result.current.confirmDelete(plan));
    await waitFor(() => expect(mocks.remove).toHaveBeenCalled());
    expect(onDeleted).toHaveBeenCalledWith(plan);
    expect(mocks.toast).toHaveBeenCalledWith('Deleted Garage');
  });

  it('does not send a refused delete plan or alter the pending delete', () => {
    const current = world();
    const { result } = renderHook(() =>
      usePlaceEdits({ world: current, offline: false, onDeleted: vi.fn() })
    );
    act(() => result.current.requestDelete('home'));
    const refused = planDelete(current, 'home', 'reparent');
    expect(refused.refusal).not.toBeNull();
    act(() => result.current.confirmDelete(refused));
    expect(mocks.remove).not.toHaveBeenCalled();
    expect(result.current.deleting).toEqual({ placeId: 'home', mode: 'to-hand' });
  });

  it('keeps all edit commands inert while offline', () => {
    const { result } = renderHook(() =>
      usePlaceEdits({ world: world(), offline: true, onDeleted: vi.fn() })
    );
    act(() => {
      result.current.startCreate('home');
      result.current.startRename('garage');
      result.current.requestDelete('garage');
      result.current.moveTo('garage', null);
    });
    expect(result.current.creatingUnder).toBeUndefined();
    expect(result.current.renamingId).toBeNull();
    expect(result.current.deleting).toBeNull();
    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.rename).not.toHaveBeenCalled();
    expect(mocks.move).not.toHaveBeenCalled();
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
