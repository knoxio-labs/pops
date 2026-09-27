import { beforeEach, describe, expect, it, vi } from 'vitest';

import { type TrackWrite, type TrackedWrites } from '../../../foundation/list-page/take-out.js';
import { coreWorld } from '../../../foundation/test-fixtures/core.js';
import { executeExit } from './container-exit.js';
import { initialUnpack, unpackReducer } from './unpack-model.js';

import type { PlacementTarget } from '../../../foundation/model/model.js';
import type { BulkRefusal, BulkResult } from '../../../inventory-web/item-verbs-bulk.js';
import type { UnpackAction, UnpackState } from './unpack-model.js';

const mocks = vi.hoisted(() => ({
  showUndoToast: vi.fn(),
}));

vi.mock('../../../foundation/feedback/undo-toast.js', () => ({
  showUndoToast: mocks.showUndoToast,
}));

type ExitInput = Parameters<typeof executeExit>[0];

function result(
  applied: readonly string[],
  refused: BulkRefusal[] = [],
  undo: (() => Promise<void>) | null = null
): BulkResult {
  return { applied: [...applied], refused, undo };
}

function stateAndDispatch(
  inside: readonly string[] = ['itm-usbc', 'itm-sheets'],
  access: UnpackState['access'] = 'open'
): {
  getState: () => UnpackState;
  dispatch: (action: UnpackAction) => void;
  actions: UnpackAction[];
} {
  let state = initialUnpack(inside, access);
  const actions: UnpackAction[] = [];
  return {
    getState: () => state,
    dispatch: (action) => {
      actions.push(action);
      state = unpackReducer(state, action);
    },
    actions,
  };
}

function tracked(
  track: TrackWrite,
  setRejection: TrackedWrites['setRejection'] = () => undefined
): TrackedWrites {
  return { rejections: {}, track, setRejection };
}

function input(
  state: UnpackState,
  dispatch: (action: UnpackAction) => void,
  overrides: Partial<ExitInput> = {}
): ExitInput {
  return {
    ids: ['itm-usbc', 'not-inside', 'itm-usbc', 'itm-sheets'],
    how: 'take-out',
    state,
    world: coreWorld,
    bulk: {
      move: async (ids) => result(ids),
      pickUp: async (ids) => result(ids),
    },
    tracked: tracked(async (_ids, run) => run()),
    dispatch,
    openMove: () => undefined,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('executeExit', () => {
  it('takes out unique ids that are inside and chooses move or pick-up by destination', async () => {
    const { getState, dispatch, actions } = stateAndDispatch();
    const moved: Array<{ ids: string[]; target: PlacementTarget }> = [];
    const moveCalls: string[][] = [];
    const pickUpCalls: string[][] = [];
    const trackCalls: string[][] = [];
    const mutation = input(getState(), dispatch, {
      bulk: {
        move: async (ids, target) => {
          moveCalls.push([...ids]);
          moved.push({ ids: [...ids], target });
          return result(ids);
        },
        pickUp: async (ids) => {
          pickUpCalls.push([...ids]);
          return result(ids);
        },
      },
      tracked: tracked(async (ids, run) => {
        trackCalls.push([...ids]);
        return run();
      }),
    });

    await executeExit(mutation);

    expect(trackCalls).toEqual([['itm-usbc'], ['itm-sheets']]);
    expect(moveCalls).toEqual([['itm-usbc']]);
    expect(pickUpCalls).toEqual([['itm-sheets']]);
    expect(moved).toEqual([
      { ids: ['itm-usbc'], target: { kind: 'container', containerId: 'box-cables' } },
    ]);
    expect(actions).toEqual([
      { type: 'exit', ids: ['itm-usbc', 'itm-sheets'], how: 'take-out' },
      { type: 'restore', ids: [] },
    ]);
    expect(getState().inside).toEqual([]);
  });

  it('uses pick-up directly for the pick-up branch after deduplicating ids', async () => {
    const { getState, dispatch } = stateAndDispatch();
    const trackCalls: string[][] = [];
    const pickUpCalls: string[][] = [];
    const mutation = input(getState(), dispatch, {
      how: 'pick-up',
      ids: ['itm-usbc', 'itm-usbc', 'not-inside'],
      bulk: {
        move: async (ids) => result(ids),
        pickUp: async (ids) => {
          pickUpCalls.push([...ids]);
          return result(ids);
        },
      },
      tracked: tracked(async (ids, run) => {
        trackCalls.push([...ids]);
        return run();
      }),
    });

    await executeExit(mutation);

    expect(trackCalls).toEqual([['itm-usbc']]);
    expect(pickUpCalls).toEqual([['itm-usbc']]);
  });

  it('short-circuits closed access before dispatching or writing', async () => {
    const { getState, dispatch, actions } = stateAndDispatch(['itm-usbc', 'itm-sheets'], 'closed');
    const track = vi.fn<TrackWrite>(async (_ids, run) => run());
    const move = vi.fn(async (ids: readonly string[]) => result(ids));
    const pickUp = vi.fn(async (ids: readonly string[]) => result(ids));

    await executeExit(
      input(getState(), dispatch, {
        tracked: tracked(track),
        bulk: { move, pickUp },
      })
    );

    expect(actions).toEqual([]);
    expect(track).not.toHaveBeenCalled();
    expect(move).not.toHaveBeenCalled();
    expect(pickUp).not.toHaveBeenCalled();
  });

  it('restores every selected item and records each rejection when the write fails', async () => {
    const { getState, dispatch, actions } = stateAndDispatch();
    const setRejection = vi.fn<TrackedWrites['setRejection']>();
    const mutation = input(getState(), dispatch, {
      how: 'pick-up',
      bulk: {
        move: async (_ids) => result([]),
        pickUp: async () => {
          throw new Error('offline');
        },
      },
      tracked: tracked(async (_ids, run) => run(), setRejection),
    });

    await executeExit(mutation);

    expect(actions).toEqual([
      { type: 'exit', ids: ['itm-usbc', 'itm-sheets'], how: 'pick-up' },
      { type: 'restore', ids: ['itm-usbc', 'itm-sheets'] },
    ]);
    expect(getState().inside).toEqual(['itm-usbc', 'itm-sheets']);
    expect(setRejection).toHaveBeenNthCalledWith(
      1,
      'itm-usbc',
      'The inventory service did not answer.'
    );
    expect(setRejection).toHaveBeenNthCalledWith(
      2,
      'itm-sheets',
      'The inventory service did not answer.'
    );
  });

  it('restores only the refused ids after a partial bulk result', async () => {
    const { getState, dispatch, actions } = stateAndDispatch();
    const setRejection = vi.fn<TrackedWrites['setRejection']>();
    const refused: BulkRefusal = {
      id: 'itm-sheets',
      refusal: {
        kind: 'outcome',
        outcome: {
          status: 'rejected',
          mutationId: 'mutation-sheets',
          reason: 'container_closed',
          message: 'The box is closed.',
        },
      },
    };
    const mutation = input(getState(), dispatch, {
      how: 'pick-up',
      bulk: {
        move: async (_ids) => result([]),
        pickUp: async (_ids) => result(['itm-usbc'], [refused]),
      },
      tracked: tracked(async (_ids, run) => {
        const response = await run();
        for (const item of response.refused) setRejection(item.id, 'The box is closed.');
        return response;
      }, setRejection),
    });

    await executeExit(mutation);

    expect(actions).toEqual([
      { type: 'exit', ids: ['itm-usbc', 'itm-sheets'], how: 'pick-up' },
      { type: 'restore', ids: ['itm-sheets'] },
    ]);
    expect(getState().inside).toEqual(['itm-sheets']);
    expect(setRejection).toHaveBeenCalledWith('itm-sheets', 'The box is closed.');
  });
});
