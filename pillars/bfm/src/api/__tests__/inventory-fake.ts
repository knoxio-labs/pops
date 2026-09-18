/**
 * A stand-in for the inventory pillar's sync surface, behind a real
 * {@link PillarGateway}. Mirrors `purchases-read-fake.ts`: only the network is
 * replaced, so the gateway, the wire validation and the mapping in
 * `api/inventory/client.ts` are all production code under test.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

export interface InventorySyncCall {
  cursor?: string;
  limit?: number;
}

export interface InventoryChangesCall {
  since?: number;
  epoch?: string;
  limit?: number;
}

export interface InventoryFake {
  factory: PillarHandleFactory;
  snapshotCalls: InventorySyncCall[];
  changesCalls: InventoryChangesCall[];
  itemEventsCalls: (InventorySyncCall & { id?: string })[];
  catalogueCalls: number;
}

export interface InventoryFakeOptions {
  /** What `sync.snapshot` answers. Defaults to an empty, fully-drained page. */
  snapshotResult?: CallResult<unknown>;
  /** What `sync.changes` answers. */
  changesResult?: CallResult<unknown>;
  /**
   * What `sync.itemEvents` answers, per item id. An id absent from the map
   * answers the producer's own not-found shape.
   */
  itemEventsResult?: Readonly<Record<string, CallResult<unknown>>>;
  /** What `types.catalogue` answers. */
  catalogueResult?: CallResult<unknown>;
}

function makeSnapshotProcedure(
  options: InventoryFakeOptions,
  calls: InventorySyncCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    calls.push(readSyncCall(rawInput));
    return Promise.resolve(
      options.snapshotResult ?? {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          highWaterSeq: 0,
          catalogueVersion: 'cat-1',
          total: 0,
          items: [],
          locations: [],
          nextCursor: null,
        },
      }
    );
  };
}

function makeChangesProcedure(
  options: InventoryFakeOptions,
  calls: InventoryChangesCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    calls.push(readChangesCall(rawInput));
    return Promise.resolve(
      options.changesResult ?? {
        kind: 'ok',
        value: {
          epoch: 'epoch-1',
          items: [],
          locations: [],
          events: [],
          nextSince: 0,
          hasMore: false,
          catalogueVersion: 'cat-1',
        },
      }
    );
  };
}

function makeItemEventsProcedure(
  options: InventoryFakeOptions,
  calls: (InventorySyncCall & { id?: string })[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    const call = readSyncCall(rawInput);
    const id = readItemId(rawInput);
    calls.push({ ...call, id });
    const byId = options.itemEventsResult ?? {};
    return Promise.resolve(
      byId[id] ?? { kind: 'not-found', pillar: 'inventory', message: `item ${id} not found` }
    );
  };
}

/** @param options What each procedure answers; see {@link InventoryFakeOptions}. */
export function createInventoryFake(options: InventoryFakeOptions = {}): InventoryFake {
  const snapshotCalls: InventorySyncCall[] = [];
  const changesCalls: InventoryChangesCall[] = [];
  const itemEventsCalls: (InventorySyncCall & { id?: string })[] = [];
  let catalogueCalls = 0;

  const catalogue = (): Promise<CallResult<unknown>> => {
    catalogueCalls += 1;
    return Promise.resolve(
      options.catalogueResult ?? { kind: 'ok', value: { version: 'cat-1', units: [], types: [] } }
    );
  };

  return {
    factory: <TRouter>() =>
      fakePillarHandle<TRouter>('inventory', {
        sync: {
          snapshot: makeSnapshotProcedure(options, snapshotCalls),
          changes: makeChangesProcedure(options, changesCalls),
          itemEvents: makeItemEventsProcedure(options, itemEventsCalls),
        },
        types: { catalogue },
      }),
    snapshotCalls,
    changesCalls,
    itemEventsCalls,
    get catalogueCalls() {
      return catalogueCalls;
    },
  };
}

function readSyncCall(input: unknown): InventorySyncCall {
  if (input === null || typeof input !== 'object') return {};
  return {
    cursor: 'cursor' in input && typeof input.cursor === 'string' ? input.cursor : undefined,
    limit: 'limit' in input && typeof input.limit === 'number' ? input.limit : undefined,
  };
}

function readChangesCall(input: unknown): InventoryChangesCall {
  if (input === null || typeof input !== 'object') return {};
  return {
    since: 'since' in input && typeof input.since === 'number' ? input.since : undefined,
    epoch: 'epoch' in input && typeof input.epoch === 'string' ? input.epoch : undefined,
    limit: 'limit' in input && typeof input.limit === 'number' ? input.limit : undefined,
  };
}

function readItemId(input: unknown): string {
  if (
    input !== null &&
    typeof input === 'object' &&
    'id' in input &&
    typeof input.id === 'string'
  ) {
    return input.id;
  }
  throw new Error('[bfm-test] sync.itemEvents was called without an id');
}
