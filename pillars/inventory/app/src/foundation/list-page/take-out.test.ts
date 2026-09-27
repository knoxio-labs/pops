import { describe, expect, it, vi } from 'vitest';

import { coreWorld } from '../test-fixtures/core.js';
import { runTakeOut } from './take-out.js';

import type { BulkResult } from '../../inventory-web/item-verbs-bulk.js';
import type { PlacementTarget } from '../model/model.js';
import type { TrackWrite } from './take-out.js';

function result(applied: string[], undo: (() => Promise<void>) | null = null): BulkResult {
  return { applied, refused: [], undo };
}

describe('runTakeOut', () => {
  it('groups by destination, preserves first appearance order and chooses the right verb', async () => {
    const moves: Array<{ ids: readonly string[]; target: PlacementTarget }> = [];
    const pickedUp: string[][] = [];
    const bulk = {
      move: vi.fn(async (ids: readonly string[], target: PlacementTarget): Promise<BulkResult> => {
        moves.push({ ids, target });
        return result([...ids]);
      }),
      pickUp: vi.fn(async (ids: readonly string[]): Promise<BulkResult> => {
        pickedUp.push([...ids]);
        return result([...ids]);
      }),
    };
    const tracked: string[][] = [];
    const track: TrackWrite = async (ids, run) => {
      tracked.push([...ids]);
      return run();
    };

    const run = await runTakeOut({
      world: coreWorld,
      ids: ['itm-usbc', 'itm-sheets', 'itm-charger', 'itm-usbc'],
      bulk,
      track,
    });

    expect(tracked).toEqual([['itm-usbc'], ['itm-sheets'], ['itm-charger']]);
    expect(moves).toEqual([
      {
        ids: ['itm-usbc'],
        target: { kind: 'container', containerId: 'box-cables' },
      },
      {
        ids: ['itm-charger'],
        target: { kind: 'location', locationId: 'loc-shelving' },
      },
    ]);
    expect(pickedUp).toEqual([['itm-sheets']]);
    expect(run.applied).toEqual(['itm-usbc', 'itm-sheets', 'itm-charger']);
  });

  it('skips items without a known container and undoes groups in reverse order', async () => {
    const undoOrder: string[] = [];
    const bulk = {
      move: vi.fn(async (ids: readonly string[]): Promise<BulkResult> =>
        result([...ids], async () => {
          undoOrder.push(ids.join(','));
        })
      ),
      pickUp: vi.fn(async (ids: readonly string[]): Promise<BulkResult> =>
        result([...ids], async () => {
          undoOrder.push(ids.join(','));
        })
      ),
    };
    const trackedIds: string[][] = [];
    const track: TrackWrite = async (ids, run) => {
      trackedIds.push([...ids]);
      return run();
    };

    const run = await runTakeOut({
      world: coreWorld,
      ids: ['itm-lamp', 'itm-charger', 'itm-sheets'],
      bulk,
      track,
    });

    expect(trackedIds).toEqual([['itm-charger'], ['itm-sheets']]);
    expect(run.undo).not.toBeNull();
    await run.undo?.();
    expect(undoOrder).toEqual(['itm-sheets', 'itm-charger']);
  });

  it('returns no undo when every group applies nothing', async () => {
    const bulk = {
      move: vi.fn(async (): Promise<BulkResult> => result([])),
      pickUp: vi.fn(async (): Promise<BulkResult> => result([])),
    };
    const run = await runTakeOut({
      world: coreWorld,
      ids: ['itm-charger', 'itm-sheets'],
      bulk,
      track: async (_ids, execute) => execute(),
    });

    expect(run.applied).toEqual([]);
    expect(run.undo).toBeNull();
  });
});
