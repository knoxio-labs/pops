/**
 * A stand-in for the finance pillar, behind a real {@link PillarGateway}.
 *
 * It is a fake HANDLE, not a fake gateway: the gateway, the wire validation
 * and the paging arithmetic are all the production code under test, and only
 * the network is replaced. A fake gateway would let bfm ask finance for
 * anything at all and still pass.
 *
 * The list implementation reproduces finance's contract rather than a
 * convenient approximation — total `date DESC, id DESC` order, an inclusive
 * `limit`, and a `(beforeDate, beforeId)` anchor selecting rows strictly after
 * that pair. `pillars/finance/src/db/__tests__/transactions.test.ts` is what
 * holds finance to the same semantics; the two must be read as a pair.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

/** A full finance transaction row, as finance's REST layer serves one. */
export interface FinanceFakeRow {
  id: string;
  description: string;
  account: string;
  /** Signed decimal dollars — expenses negative, exactly as finance emits. */
  amount: number;
  date: string;
  type: string;
  tags: string[];
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  country: string | null;
  relatedTransactionId: string | null;
  notes: string | null;
  lastEditedTime: string;
}

export interface ListCall {
  limit?: number;
  beforeDate?: string;
  beforeId?: string;
}

export interface FinanceFake {
  factory: PillarHandleFactory;
  /** Every `transactions.list` input bfm sent, in order. */
  listCalls: ListCall[];
  /** Add a row after the fake has been handed out, as an import would. */
  insert: (row: FinanceFakeRow) => void;
}

export function financeRow(overrides: Partial<FinanceFakeRow> & { id: string }): FinanceFakeRow {
  return {
    description: 'Woolworths',
    account: 'Up Everyday',
    amount: -42.5,
    date: '2026-03-01',
    type: 'purchase',
    tags: ['groceries'],
    entityId: 'ent-1',
    entityName: 'Woolworths',
    location: null,
    country: 'AU',
    relatedTransactionId: null,
    notes: null,
    lastEditedTime: '2026-03-01T10:00:00.000Z',
    ...overrides,
  };
}

/** finance's total order: newest date first, then id descending. */
function compareRows(left: FinanceFakeRow, right: FinanceFakeRow): number {
  if (left.date !== right.date) return left.date < right.date ? 1 : -1;
  if (left.id === right.id) return 0;
  return left.id < right.id ? 1 : -1;
}

function isAfterAnchor(row: FinanceFakeRow, anchor: { date: string; id: string }): boolean {
  if (row.date !== anchor.date) return row.date < anchor.date;
  return row.id < anchor.id;
}

/**
 * Read the wire input the SDK hands a procedure. The transport carries
 * `unknown`, so the fake narrows it the way finance's zod layer would rather
 * than trusting the caller.
 */
function readListCall(input: unknown): ListCall {
  if (input === null || typeof input !== 'object') return {};
  return {
    limit: 'limit' in input && typeof input.limit === 'number' ? input.limit : undefined,
    beforeDate:
      'beforeDate' in input && typeof input.beforeDate === 'string' ? input.beforeDate : undefined,
    beforeId:
      'beforeId' in input && typeof input.beforeId === 'string' ? input.beforeId : undefined,
  };
}

/**
 * A fake finance holding `rows`, answering the two operations bfm calls.
 *
 * `failWith` short-circuits every call with one SDK failure, for the
 * degradation paths.
 */
export function createFinanceFake(
  rows: readonly FinanceFakeRow[],
  failWith?: Exclude<CallResult<unknown>, { kind: 'ok' }>
): FinanceFake {
  const store = [...rows];
  const listCalls: ListCall[] = [];

  const list = (rawInput: unknown): Promise<CallResult<unknown>> => {
    const input = readListCall(rawInput);
    listCalls.push(input);
    if (failWith !== undefined) return Promise.resolve(failWith);

    const ordered = store.toSorted(compareRows);
    const anchor =
      input.beforeDate !== undefined && input.beforeId !== undefined
        ? { date: input.beforeDate, id: input.beforeId }
        : undefined;
    const matched =
      anchor === undefined ? ordered : ordered.filter((row) => isAfterAnchor(row, anchor));
    const limit = input.limit ?? 50;
    const page = matched.slice(0, limit);

    return Promise.resolve({
      kind: 'ok',
      value: {
        data: page,
        pagination: { total: matched.length, limit, offset: 0, hasMore: matched.length > limit },
      },
    });
  };

  const get = (input: unknown): Promise<CallResult<unknown>> => {
    if (failWith !== undefined) return Promise.resolve(failWith);
    const id = input !== null && typeof input === 'object' && 'id' in input ? input.id : undefined;
    const found = store.find((row) => row.id === id);
    if (found === undefined) {
      return Promise.resolve({ kind: 'not-found', pillar: 'finance' });
    }
    return Promise.resolve({ kind: 'ok', value: { data: found } });
  };

  return {
    factory: <TRouter>() => fakePillarHandle<TRouter>('finance', { transactions: { list, get } }),
    listCalls,
    insert: (row: FinanceFakeRow) => {
      store.push(row);
    },
  };
}

/**
 * A fake whose `transactions.list` succeeds but answers with a body that is not
 * finance's — the `contract-mismatch` path that must stay distinguishable from
 * an outage.
 */
export function createMalformedFinanceFake(value: unknown): PillarHandleFactory {
  const routes = {
    transactions: {
      list: (): CallResult<unknown> => ({ kind: 'ok', value }),
      get: (): CallResult<unknown> => ({ kind: 'ok', value }),
    },
  };
  return <TRouter>() => fakePillarHandle<TRouter>('finance', routes);
}
