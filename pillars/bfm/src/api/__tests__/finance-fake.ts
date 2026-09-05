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
  /** FK to the fake's `accounts` store — finance carries no denormalised name. */
  accountId: string;
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
  accountId?: string;
}

/** A full finance account row, as finance's REST layer serves one. */
export interface FinanceFakeAccountRow {
  id: string;
  name: string;
  kind: string;
  currency: string;
  archivedAt: string | null;
  institutionId: string | null;
  entityDisplayName: string | null;
  transactionCount: number;
  balance: {
    balanceCents: number;
    asOf: string;
    basis: 'checkpoint' | 'transactions';
    anchor: unknown;
    inconsistent: boolean;
  };
}

export function financeAccountRow(
  overrides: Partial<FinanceFakeAccountRow> & { id: string }
): FinanceFakeAccountRow {
  return {
    name: 'Up Everyday',
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    institutionId: null,
    entityDisplayName: null,
    transactionCount: 0,
    balance: {
      balanceCents: 0,
      asOf: '2026-09-05',
      basis: 'transactions',
      anchor: null,
      inconsistent: false,
    },
    ...overrides,
  };
}

/** The default account every `financeRow()` fixture's `accountId` resolves against. */
const DEFAULT_ACCOUNT = financeAccountRow({ id: 'acc-up-everyday' });

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
    accountId: 'acc-up-everyday',
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
    accountId:
      'accountId' in input && typeof input.accountId === 'string' ? input.accountId : undefined,
  };
}

/**
 * A fake finance holding `rows`, answering the two operations bfm calls.
 *
 * `failWith` short-circuits every call with one SDK failure, for the
 * degradation paths.
 */
/**
 * What finance's `transactions.list` would answer for one call: the account
 * filter, the total order, the keyset anchor and the page, in that order.
 *
 * Outside {@link createFinanceFake} rather than inside it because it closes
 * over nothing — every input is an argument — and because a fake whose paging
 * is a nested closure is a fake nobody reads before trusting.
 */
function selectPage(
  store: readonly FinanceFakeRow[],
  input: ListCall
): { data: FinanceFakeRow[]; pagination: FinanceFakePagination } {
  const ordered = store
    .filter((row) => input.accountId === undefined || row.accountId === input.accountId)
    .toSorted(compareRows);
  const anchor =
    input.beforeDate !== undefined && input.beforeId !== undefined
      ? { date: input.beforeDate, id: input.beforeId }
      : undefined;
  const matched =
    anchor === undefined ? ordered : ordered.filter((row) => isAfterAnchor(row, anchor));
  const limit = input.limit ?? 50;

  return {
    data: matched.slice(0, limit),
    pagination: { total: matched.length, limit, offset: 0, hasMore: matched.length > limit },
  };
}

interface FinanceFakePagination {
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export function createFinanceFake(
  rows: readonly FinanceFakeRow[],
  failWith?: Exclude<CallResult<unknown>, { kind: 'ok' }>,
  accounts: readonly FinanceFakeAccountRow[] = [DEFAULT_ACCOUNT]
): FinanceFake {
  const store = [...rows];
  const accountStore = [...accounts];
  const listCalls: ListCall[] = [];

  const list = (rawInput: unknown): Promise<CallResult<unknown>> => {
    const input = readListCall(rawInput);
    listCalls.push(input);
    if (failWith !== undefined) return Promise.resolve(failWith);

    return Promise.resolve({ kind: 'ok', value: selectPage(store, input) });
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

  const getAccount = (input: unknown): Promise<CallResult<unknown>> => {
    if (failWith !== undefined) return Promise.resolve(failWith);
    const id = input !== null && typeof input === 'object' && 'id' in input ? input.id : undefined;
    const found = accountStore.find((row) => row.id === id);
    if (found === undefined) {
      return Promise.resolve({ kind: 'not-found', pillar: 'finance' });
    }
    return Promise.resolve({ kind: 'ok', value: { data: found } });
  };

  return {
    factory: <TRouter>() =>
      fakePillarHandle<TRouter>('finance', {
        transactions: { list, get },
        accounts: { get: getAccount },
      }),
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
