/**
 * A stand-in for finance's `accounts` router, behind a real
 * {@link PillarGateway} — see `finance-fake.ts` for why this fakes the HANDLE
 * rather than the gateway.
 *
 * Finance applies account name, account-kind, and list filters before serving
 * each bounded page to the BFM.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { FinanceAccountBalance } from '../finance/wire.js';
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
  balance: FinanceAccountBalance & { anchor: unknown };
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
      reconciliation: 'unmeasured',
      inconsistent: false,
    },
    ...overrides,
  };
}

interface AccountListInput {
  readonly limit: number;
  readonly offset: number;
  readonly search: string | undefined;
  readonly kind: string | undefined;
  readonly archived: 'true' | 'false' | undefined;
}

const ACCOUNT_KIND_LABELS: Readonly<Record<string, string>> = {
  checking: 'Checking',
  savings: 'Savings',
  'credit-card': 'Credit card',
  cash: 'Cash',
  'gift-card': 'Gift card',
  person: 'Person',
  shared: 'Shared',
  loan: 'Loan',
  'novated-lease': 'Novated lease',
  crypto: 'Crypto',
  other: 'Other',
};

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
    limit: readNumber(input, 'limit') ?? 50,
    offset: readNumber(input, 'offset') ?? 0,
    search: readString(input, 'search'),
    kind: readString(input, 'kind'),
    archived: readArchived(input),
  };
}

function readNumber(input: object, key: string): number | undefined {
  const value = Reflect.get(input, key);
  return typeof value === 'number' ? value : undefined;
}

function readString(input: object, key: string): string | undefined {
  const value = Reflect.get(input, key);
  return typeof value === 'string' ? value : undefined;
}

function readArchived(input: object): 'true' | 'false' | undefined {
  const value = Reflect.get(input, 'archived');
  return value === 'true' || value === 'false' ? value : undefined;
}

function matchesAccountListInput(row: AccountFakeRow, input: AccountListInput): boolean {
  const search = input.search?.toLocaleLowerCase();
  const kindLabel = ACCOUNT_KIND_LABELS[row.kind] ?? row.kind.replaceAll('-', ' ');
  const matchesSearch =
    search === undefined ||
    row.name.toLocaleLowerCase().includes(search) ||
    kindLabel.toLocaleLowerCase().includes(search) ||
    row.kind.toLocaleLowerCase().includes(search);
  const matchesKind = input.kind === undefined || row.kind === input.kind;
  const matchesArchive =
    input.archived === undefined || (row.archivedAt !== null) === (input.archived === 'true');
  return matchesSearch && matchesKind && matchesArchive;
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
