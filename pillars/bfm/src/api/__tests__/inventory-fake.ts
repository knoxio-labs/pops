/**
 * A stand-in for the inventory pillar's sync surface, behind a real
 * {@link PillarGateway}. Mirrors `purchases-read-fake.ts`: only the network is
 * replaced, so the gateway, the wire validation and the mapping in
 * `api/inventory/client.ts` are all production code under test.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { emptyInventoryChanges, emptyInventorySnapshot } from './inventory-fake-pages.js';
import { makeItemProcedure, readItemId } from './inventory-item-fake.js';
import { makeLedgerProcedure, type InventoryLedgerCall } from './inventory-ledger-fake.js';

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

export interface InventoryItemCall {
  id?: string;
}

export interface InventoryMutationsCall {
  mutations?: unknown[];
}

export interface InventorySuggestCall {
  name?: string;
  typeKey?: string;
  stem?: string;
}

export interface InventoryFake {
  factory: PillarHandleFactory;
  snapshotCalls: InventorySyncCall[];
  changesCalls: InventoryChangesCall[];
  itemEventsCalls: (InventorySyncCall & { id?: string })[];
  itemCalls: InventoryItemCall[];
  mutationsCalls: InventoryMutationsCall[];
  ledgerCalls: InventoryLedgerCall[];
  suggestCalls: InventorySuggestCall[];
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
  /** What `sync.item` answers, per item id. */
  itemResult?: Readonly<Record<string, CallResult<unknown>>>;
  /** What `types.catalogue` answers. */
  catalogueResult?: CallResult<unknown>;
  /** What `types.read.catalogue` answers for each requested revision. */
  catalogueRevisionResult?: (revision: number) => CallResult<unknown>;
  /** What `sync.mutations` answers. Defaults to one `applied` outcome per mutation sent. */
  mutationsResult?: (input: unknown) => CallResult<unknown>;
  /** What `sync.reportLedger` answers. Defaults to `{ stored: true }`. */
  ledgerResult?: CallResult<unknown>;
  /** What `codes.suggest` answers. */
  suggestResult?: CallResult<unknown>;
}

function makeSnapshotProcedure(
  options: InventoryFakeOptions,
  calls: InventorySyncCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    calls.push(readSyncCall(rawInput));
    return Promise.resolve(options.snapshotResult ?? emptyInventorySnapshot());
  };
}

function makeChangesProcedure(
  options: InventoryFakeOptions,
  calls: InventoryChangesCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    calls.push(readChangesCall(rawInput));
    return Promise.resolve(options.changesResult ?? emptyInventoryChanges());
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

function readMutationsCall(input: unknown): InventoryMutationsCall {
  if (input === null || typeof input !== 'object' || !('mutations' in input)) return {};
  const { mutations } = input;
  return { mutations: Array.isArray(mutations) ? mutations : undefined };
}

/** One `applied` outcome per mutation sent, in order — the default shape a clean batch gets. */
function defaultMutationsResult(input: unknown): CallResult<unknown> {
  const { mutations } = readMutationsCall(input);
  const outcomes = (mutations ?? []).map((mutation, index) => {
    const mutationId =
      typeof mutation === 'object' && mutation !== null && 'mutationId' in mutation
        ? mutation.mutationId
        : `mutation-${String(index)}`;
    return { mutationId, status: 'applied', revision: 1, seq: index + 1, converged: true };
  });
  return { kind: 'ok', value: { outcomes, highWaterSeq: outcomes.length } };
}

function readSuggestCall(input: unknown): InventorySuggestCall {
  if (input === null || typeof input !== 'object') return {};
  return {
    name: 'name' in input && typeof input.name === 'string' ? input.name : undefined,
    typeKey: 'typeKey' in input && typeof input.typeKey === 'string' ? input.typeKey : undefined,
    stem: 'stem' in input && typeof input.stem === 'string' ? input.stem : undefined,
  };
}

function makeSuggestProcedure(
  options: InventoryFakeOptions,
  calls: InventorySuggestCall[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    calls.push(readSuggestCall(rawInput));
    return Promise.resolve(
      options.suggestResult ?? { kind: 'ok', value: { suggestions: ['box-1'] } }
    );
  };
}

/** @param options What each procedure answers; see {@link InventoryFakeOptions}. */
export function createInventoryFake(options: InventoryFakeOptions = {}): InventoryFake {
  const snapshotCalls: InventorySyncCall[] = [];
  const changesCalls: InventoryChangesCall[] = [];
  const itemEventsCalls: (InventorySyncCall & { id?: string })[] = [];
  const itemCalls: InventoryItemCall[] = [];
  const mutationsCalls: InventoryMutationsCall[] = [];
  const ledgerCalls: InventoryLedgerCall[] = [];
  const suggestCalls: InventorySuggestCall[] = [];
  let catalogueCalls = 0;

  const catalogue = (): Promise<CallResult<unknown>> => {
    catalogueCalls += 1;
    return Promise.resolve(
      options.catalogueResult ?? { kind: 'ok', value: { version: 'cat-1', units: [], types: [] } }
    );
  };

  const catalogueRevision = (rawInput: unknown): Promise<CallResult<unknown>> => {
    const revision = readRevision(rawInput);
    return Promise.resolve(
      options.catalogueRevisionResult?.(revision) ?? {
        kind: 'not-found',
        pillar: 'inventory',
        message: `Catalogue revision ${String(revision)} was not found`,
      }
    );
  };

  const mutations = (rawInput: unknown): Promise<CallResult<unknown>> => {
    mutationsCalls.push(readMutationsCall(rawInput));
    return Promise.resolve((options.mutationsResult ?? defaultMutationsResult)(rawInput));
  };

  const suggest = makeSuggestProcedure(options, suggestCalls);

  return {
    factory: <TRouter>() =>
      fakePillarHandle<TRouter>('inventory', {
        sync: {
          snapshot: makeSnapshotProcedure(options, snapshotCalls),
          changes: makeChangesProcedure(options, changesCalls),
          itemEvents: makeItemEventsProcedure(options, itemEventsCalls),
          item: makeItemProcedure(options, itemCalls),
          mutations,
          reportLedger: makeLedgerProcedure(options.ledgerResult, ledgerCalls),
        },
        types: { catalogue, read: { catalogue: catalogueRevision } },
        codes: { suggest },
      }),
    snapshotCalls,
    changesCalls,
    itemEventsCalls,
    itemCalls,
    mutationsCalls,
    ledgerCalls,
    suggestCalls,
    get catalogueCalls() {
      return catalogueCalls;
    },
  };
}

/**
 * The revision the SDK call carried. The server SDK takes route arguments
 * flat (`{ revision }`), exactly as `sync.snapshot({ cursor, limit })` does;
 * a `{ query: { revision } }` wrapper is not read by the SDK and reaches
 * inventory as no revision at all, which answers the current catalogue.
 */
function readRevision(input: unknown): number {
  if (input === null || typeof input !== 'object' || !('revision' in input)) return Number.NaN;
  return typeof input.revision === 'number' ? input.revision : Number.NaN;
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
