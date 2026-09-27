import { beforeEach, describe, expect, it, vi } from 'vitest';

import { executeLifecycle } from './container-lifecycle.js';
import { initialUnpack, unpackReducer } from './unpack-model.js';

import type { LifecycleMutationInput } from './container-lifecycle.js';
import type { UnpackAction, UnpackState } from './unpack-model.js';

const mocks = vi.hoisted(() => ({
  showUndoToast: vi.fn(),
}));

vi.mock('../../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));

function stateAndDispatch(): {
  getState: () => UnpackState;
  dispatch: (action: UnpackAction) => void;
} {
  let state = initialUnpack(['one', 'two'], 'open');
  return {
    getState: () => state,
    dispatch: (action) => {
      state = unpackReducer(state, action);
    },
  };
}

function input(
  dispatch: (action: UnpackAction) => void,
  state: UnpackState,
  overrides: Partial<LifecycleMutationInput> = {}
): LifecycleMutationInput {
  return {
    pending: { ids: ['one', 'two'], act: 'retire' },
    reason: null,
    state,
    bulk: {
      setLifecycle: vi.fn(async () => ({ applied: ['one'], refused: [], undo: null })),
    },
    tracked: {
      rejections: {},
      track: async (_ids, run) => run(),
      setRejection: vi.fn(),
    },
    dispatch,
    ...overrides,
  };
}

describe('executeLifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('restores unapplied items and items restored through the undo toast', async () => {
    const { dispatch, getState } = stateAndDispatch();
    const undo = vi.fn(async () => undefined);
    const offer: { onUndo: () => Promise<void> }[] = [];
    mocks.showUndoToast.mockImplementation((value: { onUndo: () => Promise<void> }) => {
      offer.push(value);
    });
    const mutation = input(dispatch, getState(), {
      bulk: {
        setLifecycle: vi.fn(async () => ({
          applied: ['one'],
          refused: [],
          undo,
        })),
      },
    });

    await executeLifecycle(mutation);

    expect(getState().inside).toEqual(['two']);
    expect(getState().out).toEqual([{ id: 'one', how: 'lifecycle' }]);
    expect(offer).toHaveLength(1);

    await offer[0]?.onUndo();

    expect(undo).toHaveBeenCalledOnce();
    expect(getState().inside).toEqual(['two', 'one']);
    expect(getState().out).toEqual([]);
  });

  it('restores every item when the lifecycle write fails', async () => {
    const { dispatch, getState } = stateAndDispatch();
    const setRejection = vi.fn();
    const mutation = input(dispatch, getState(), {
      bulk: {
        setLifecycle: vi.fn(async () => {
          throw new Error('offline');
        }),
      },
      tracked: {
        rejections: {},
        track: async (_ids, run) => run(),
        setRejection,
      },
    });

    await executeLifecycle(mutation);

    expect(getState().inside).toEqual(['one', 'two']);
    expect(getState().out).toEqual([]);
    expect(setRejection).toHaveBeenCalledTimes(2);
  });
});
