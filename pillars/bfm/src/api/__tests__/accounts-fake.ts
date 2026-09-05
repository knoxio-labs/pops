/**
 * A stand-in for finance's `accounts` router, behind a real
 * {@link PillarGateway} — see `finance-fake.ts` for why this fakes the HANDLE
 * rather than the gateway.
 *
 * Unlike `transactions.list`, `accounts.list` is not paged here: bfm always
 * asks for one page at the contract's cap (`ACCOUNT_LIST_LIMIT`), mirroring
 * `AccountsRepository.accounts()`'s own "small enough to fetch whole" premise.
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
  institutionId: string | null;
  entityDisplayName: string | null;
  balance: {
    balanceCents: number;
    asOf: string;
    basis: 'checkpoint' | 'transactions';
    anchor: unknown;
    inconsistent: boolean;
  };
}

/** One row of finance's institutions list, as bfm reads it. */
export interface InstitutionFakeRow {
  id: string;
  name: string;
}

/**
 * What a fake finance answers beyond the accounts themselves — the two
 * lookups the mobile accounts routes make on the side (POPS-2848).
 *
 * Each has its own failure switch rather than sharing `failWith`, because the
 * whole point of both is that they degrade independently: an institutions
 * outage must not cost the list its balances, and a history outage must not
 * cost the dashboard its account.
 */
export interface AccountsFakeExtras {
  readonly institutions?: readonly InstitutionFakeRow[];
  /** Account id → its month-end series. A missing id answers an empty series. */
  readonly history?: Readonly<Record<string, readonly { month: string; balanceCents: number }[]>>;
  readonly institutionsFailWith?: Exclude<CallResult<unknown>, { kind: 'ok' }>;
  readonly historyFailWith?: Exclude<CallResult<unknown>, { kind: 'ok' }>;
}

export interface AccountsFake {
  factory: PillarHandleFactory;
  /** Every `accounts.list` input bfm sent, in order. */
  listCalls: unknown[];
  /** Every `institutions.list` call bfm made — length is what tests assert on. */
  institutionCalls: unknown[];
  /** Every `checkpoints.history` input bfm sent, in order. */
  historyCalls: unknown[];
}

export function accountRow(overrides: Partial<AccountFakeRow> & { id: string }): AccountFakeRow {
  return {
    name: 'Everyday',
    kind: 'checking',
    currency: 'AUD',
    archivedAt: null,
    institutionId: null,
    entityDisplayName: null,
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
  const institutionCalls: unknown[] = [];
  const historyCalls: unknown[] = [];

  const list = (rawInput: unknown): Promise<CallResult<unknown>> => {
    listCalls.push(rawInput);
    if (failWith !== undefined) return Promise.resolve(failWith);
    return Promise.resolve({ kind: 'ok', value: { data: rows } });
  };

  const get = (input: unknown): Promise<CallResult<unknown>> => {
    if (failWith !== undefined) return Promise.resolve(failWith);
    const id = input !== null && typeof input === 'object' && 'id' in input ? input.id : undefined;
    const found = rows.find((row) => row.id === id);
    if (found === undefined) {
      return Promise.resolve({ kind: 'not-found', pillar: 'finance' });
    }
    return Promise.resolve({ kind: 'ok', value: { data: found } });
  };

  const listInstitutions = (rawInput: unknown): Promise<CallResult<unknown>> => {
    institutionCalls.push(rawInput);
    if (extras.institutionsFailWith !== undefined) {
      return Promise.resolve(extras.institutionsFailWith);
    }
    return Promise.resolve({ kind: 'ok', value: { data: extras.institutions ?? [] } });
  };

  const history = (input: unknown): Promise<CallResult<unknown>> => {
    historyCalls.push(input);
    if (extras.historyFailWith !== undefined) return Promise.resolve(extras.historyFailWith);
    const id = input !== null && typeof input === 'object' && 'id' in input ? input.id : undefined;
    const series = typeof id === 'string' ? (extras.history?.[id] ?? []) : [];
    return Promise.resolve({ kind: 'ok', value: { data: series } });
  };

  return {
    factory: <TRouter>() =>
      fakePillarHandle<TRouter>('finance', {
        accounts: { list, get },
        institutions: { list: listInstitutions },
        checkpoints: { history },
      }),
    listCalls,
    institutionCalls,
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
    institutions: { list: (): CallResult<unknown> => ({ kind: 'ok', value: { data: [] } }) },
    checkpoints: { history: (): CallResult<unknown> => ({ kind: 'ok', value: { data: [] } }) },
  };
  return <TRouter>() => fakePillarHandle<TRouter>('finance', routes);
}
