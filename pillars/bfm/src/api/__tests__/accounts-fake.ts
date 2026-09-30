/**
 * A stand-in for finance's `accounts` router, behind a real
 * {@link PillarGateway} — see `finance-fake.ts` for why this fakes the HANDLE
 * rather than the gateway.
 *
 * Finance account rows are served in bounded pages so the BFM can search
 * resolved institution and contact labels before returning its mobile page.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { PillarHandleFactory } from '../pillars/gateway.js';

/** A full finance account row, as finance's REST layer serves one. */
export interface AccountFakeRow {
  id: string;
  name: string;
  kind: string;
  currency: string;
  archivedAt: string | null;
  displayOrder: number;
  entityId: string | null;
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

/**
 * What a fake finance answers beyond the accounts themselves — the
 * balance-history lookup the account-detail route makes on the side
 * (POPS-2848).
 */
export interface AccountsFakeExtras {
  /** Account id → its month-end series. A missing id answers an empty series. */
  readonly history?: Readonly<Record<string, readonly { month: string; balanceCents: number }[]>>;
  readonly historyFailWith?: Exclude<CallResult<unknown>, { kind: 'ok' }>;
}

export interface AccountsFake {
  factory: PillarHandleFactory;
  /** Every `accounts.list` input bfm sent, in order. */
  listCalls: unknown[];
  /** Every `checkpoints.history` input bfm sent, in order. */
  historyCalls: unknown[];
}

export function accountRow(overrides: Partial<AccountFakeRow> & { id: string }): AccountFakeRow {
  return {
    name: 'Everyday',
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    displayOrder: 0,
    entityId: null,
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

interface AccountListInput {
  readonly limit: number;
  readonly offset: number;
  readonly kind: string | undefined;
  readonly archived: 'true' | 'false' | undefined;
}

interface AccountListPage {
  readonly data: readonly AccountFakeRow[];
  readonly pagination: {
    readonly total: number;
    readonly limit: number;
    readonly offset: number;
    readonly hasMore: boolean;
  };
}

function readAccountListInput(rawInput: unknown): AccountListInput {
  const input = typeof rawInput === 'object' && rawInput !== null ? rawInput : {};
  return {
    limit: 'limit' in input && typeof input.limit === 'number' ? input.limit : 50,
    offset: 'offset' in input && typeof input.offset === 'number' ? input.offset : 0,
    kind: 'kind' in input && typeof input.kind === 'string' ? input.kind : undefined,
    archived:
      'archived' in input && (input.archived === 'true' || input.archived === 'false')
        ? input.archived
        : undefined,
  };
}

function matchesAccountListInput(row: AccountFakeRow, input: AccountListInput): boolean {
  const matchesKind = input.kind === undefined || row.kind === input.kind;
  const matchesArchive =
    input.archived === undefined || (row.archivedAt !== null) === (input.archived === 'true');
  return matchesKind && matchesArchive;
}

function accountListPage(rows: readonly AccountFakeRow[], rawInput: unknown): AccountListPage {
  const input = readAccountListInput(rawInput);
  const filtered = rows
    .filter((row) => matchesAccountListInput(row, input))
    .toSorted(
      (left, right) =>
        left.displayOrder - right.displayOrder ||
        left.name.localeCompare(right.name) ||
        left.id.localeCompare(right.id)
    );
  return {
    data: filtered.slice(input.offset, input.offset + input.limit),
    pagination: {
      total: filtered.length,
      limit: input.limit,
      offset: input.offset,
      hasMore: input.offset + input.limit < filtered.length,
    },
  };
}

function makeAccountsListProcedure(
  rows: readonly AccountFakeRow[],
  failWith: Exclude<CallResult<unknown>, { kind: 'ok' }> | undefined,
  listCalls: unknown[]
): (rawInput: unknown) => Promise<CallResult<unknown>> {
  return (rawInput) => {
    listCalls.push(rawInput);
    if (failWith !== undefined) return Promise.resolve(failWith);
    return Promise.resolve({ kind: 'ok', value: accountListPage(rows, rawInput) });
  };
}

function makeAccountGetProcedure(
  rows: readonly AccountFakeRow[],
  failWith: Exclude<CallResult<unknown>, { kind: 'ok' }> | undefined
): (input: unknown) => Promise<CallResult<unknown>> {
  return (input) => {
    if (failWith !== undefined) return Promise.resolve(failWith);
    const id = input !== null && typeof input === 'object' && 'id' in input ? input.id : undefined;
    const found = rows.find((row) => row.id === id);
    if (found === undefined) return Promise.resolve({ kind: 'not-found', pillar: 'finance' });
    return Promise.resolve({ kind: 'ok', value: { data: found } });
  };
}

function makeAccountHistoryProcedure(
  extras: AccountsFakeExtras,
  historyCalls: unknown[]
): (input: unknown) => Promise<CallResult<unknown>> {
  return (input) => {
    historyCalls.push(input);
    if (extras.historyFailWith !== undefined) return Promise.resolve(extras.historyFailWith);
    const id = input !== null && typeof input === 'object' && 'id' in input ? input.id : undefined;
    const series = typeof id === 'string' ? (extras.history?.[id] ?? []) : [];
    return Promise.resolve({ kind: 'ok', value: { data: series } });
  };
}

/**
 * A fake finance holding `rows`, answering the two operations bfm calls.
 *
 * `failWith` short-circuits every call with one SDK failure, for the
 * degradation paths.
 */
export function createAccountsFake(
  rows: readonly AccountFakeRow[],
  failWith?: Exclude<CallResult<unknown>, { kind: 'ok' }>,
  extras: AccountsFakeExtras = {}
): AccountsFake {
  const listCalls: unknown[] = [];
  const historyCalls: unknown[] = [];
  const list = makeAccountsListProcedure(rows, failWith, listCalls);
  const get = makeAccountGetProcedure(rows, failWith);
  const history = makeAccountHistoryProcedure(extras, historyCalls);

  return {
    factory: <TRouter>() =>
      fakePillarHandle<TRouter>('finance', {
        accounts: { list, get },
        checkpoints: { history },
      }),
    listCalls,
    historyCalls,
  };
}

/**
 * A fake whose `accounts.list` succeeds but answers with a body that is not
 * finance's — the `contract-mismatch` path that must stay distinguishable
 * from an outage.
 */
export function createMalformedAccountsFake(value: unknown): PillarHandleFactory {
  const routes = {
    accounts: {
      list: (): CallResult<unknown> => ({ kind: 'ok', value }),
      get: (): CallResult<unknown> => ({ kind: 'ok', value }),
    },
    checkpoints: { history: (): CallResult<unknown> => ({ kind: 'ok', value: { data: [] } }) },
  };
  return <TRouter>() => fakePillarHandle<TRouter>('finance', routes);
}
