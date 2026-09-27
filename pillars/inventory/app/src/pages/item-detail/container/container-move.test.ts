import { describe, expect, it } from 'vitest';

import { coreItem } from '../../../foundation/test-fixtures/core.js';
import { executeMove } from './container-move.js';
import { initialUnpack } from './unpack-model.js';

import type { BulkResult } from '../../../inventory-web/item-verbs-bulk.js';
import type { UnpackAction } from './unpack-model.js';

type MoveInput = Parameters<typeof executeMove>[0];

function result(applied: readonly string[]): BulkResult {
  return { applied: [...applied], refused: [], undo: null };
}

function closedMoveInput(): {
  input: MoveInput;
  actions: UnpackAction[];
  moveCalls: readonly string[][];
  trackCalls: readonly string[][];
} {
  const actions: UnpackAction[] = [];
  const moveCalls: string[][] = [];
  const trackCalls: string[][] = [];
  return {
    input: {
      plan: {
        target: { kind: 'location', locationId: 'loc-shelving' },
        targetName: 'Shelving',
        moving: [coreItem('itm-lamp')],
        carried: [],
        alreadyThere: [],
        blocked: [],
        targetRefusal: null,
        targetFull: false,
      },
      state: initialUnpack(['itm-lamp'], 'closed'),
      bulk: {
        move: async (ids) => {
          moveCalls.push([...ids]);
          return result(ids);
        },
        pickUp: async (ids) => result(ids),
      },
      tracked: {
        rejections: {},
        track: async (ids, run) => {
          trackCalls.push([...ids]);
          return run();
        },
        setRejection: () => undefined,
      },
      dispatch: (action) => {
        actions.push(action);
      },
    },
    actions,
    moveCalls,
    trackCalls,
  };
}

describe('executeMove', () => {
  it('refuses a move when the source container has closed before apply', async () => {
    const { input, actions, moveCalls, trackCalls } = closedMoveInput();

    await executeMove(input);

    expect(actions).toEqual([]);
    expect(moveCalls).toEqual([]);
    expect(trackCalls).toEqual([]);
  });
});
