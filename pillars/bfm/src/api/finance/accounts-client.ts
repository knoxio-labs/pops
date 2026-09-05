/**
 * bfm's finance leg for the accounts screens, expressed as calls to the
 * finance pillar.
 *
 * Split from `client.ts` rather than sharing its file because the two answer
 * different screens and reach different parts of finance — this one also calls
 * `institutions` and `checkpoints`, which the transaction list never touches.
 * The failure discipline is the same and stated there: nothing here throws,
 * catches, or substitutes an empty list for a failure.
 *
 * `resolveAccountName` lives here rather than beside the transaction detail
 * that uses it, because it is an account lookup — the only account this file
 * fetches on somebody else's behalf.
 */
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import {
  FinanceAccountGetResponseSchema,
  FinanceAccountListResponseSchema,
  FinanceBalanceHistoryResponseSchema,
  FinanceInstitutionListResponseSchema,
  toMobileAccount,
  toMobileBalancePoints,
} from './wire.js';

import type { MobileAccountDetail, MobileAccountsPage } from '../../contract/rest-schemas.js';
import type { FinanceAccountRow } from './wire.js';

/** The subset of finance's router the mobile accounts screens call. */
export type FinanceAccountsRouter = {
  accounts: {
    list: (input: { limit?: number }) => Promise<unknown>;
    get: (input: { id: string }) => Promise<unknown>;
  };
  institutions: {
    list: () => Promise<unknown>;
  };
  checkpoints: {
    history: (input: { id: string; months?: number }) => Promise<unknown>;
  };
};

/**
 * The finance pillar id, as registered with the registry.
 *
 * Declared here AND in `client.ts` rather than shared between them, because
 * `check-cross-pillar-expectations.mjs` resolves a `gateway.call` target from
 * the calling file alone: a module-level `const` bound to a literal is
 * decidable, an import is not. Sharing one definition would make every call in
 * this file unpinnable and cost the seam its per-operation coverage — see that
 * script's `resolveProducerId`.
 */
export const FINANCE_PILLAR_ID = 'finance';

/**
 * Rows requested per {@link FinanceAccountsRouter.accounts.list} call — the
 * contract's own cap, so one call gets every account without a second page.
 */
const ACCOUNT_LIST_LIMIT = 500;

/**
 * Months of history the dashboard's trend draws — finance's own default, sent
 * explicitly so the series the phone charts does not change under it if that
 * default ever moves.
 */
const BALANCE_HISTORY_MONTHS = 12;

/**
 * Institution id → display name, for every institution finance knows.
 *
 * An empty map when the lookup does not come back, which is why this returns
 * a map rather than a {@link GatewayOutcome}: an unreachable institutions
 * route costs the accounts their marks, and failing the whole list over that
 * would cost somebody every balance on the screen to spare them some
 * initials. The accounts themselves still carry `institutionId`, so a caller
 * that needs to tell "no institution" from "name unresolved" can.
 */
async function resolveInstitutionNames(gateway: PillarGateway): Promise<Map<string, string>> {
  const outcome = await gateway.call<FinanceAccountsRouter, unknown>(FINANCE_PILLAR_ID, (handle) =>
    handle.institutions.list()
  );

  const list = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceInstitutionListResponseSchema,
    'institutions.list'
  );
  if (!isGatewayOk(list)) return new Map();

  return new Map(list.value.data.map((institution) => [institution.id, institution.name]));
}

/** One raw finance account row, before any mobile shaping. */
async function fetchAccountRow(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<FinanceAccountRow>> {
  const outcome = await gateway.call<FinanceAccountsRouter, unknown>(FINANCE_PILLAR_ID, (handle) =>
    handle.accounts.get({ id })
  );

  const record = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceAccountGetResponseSchema,
    'accounts.get'
  );
  if (!isGatewayOk(record)) return record;

  return { kind: 'ok', value: record.value.data };
}

export async function listAccounts(
  gateway: PillarGateway
): Promise<GatewayOutcome<MobileAccountsPage>> {
  const outcome = await gateway.call<FinanceAccountsRouter, unknown>(FINANCE_PILLAR_ID, (handle) =>
    handle.accounts.list({ limit: ACCOUNT_LIST_LIMIT })
  );

  const page = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceAccountListResponseSchema,
    'accounts.list'
  );
  if (!isGatewayOk(page)) return page;

  // Skipped entirely when nothing on the screen is held anywhere — a wallet of
  // cash and person ledgers should not pay for an institutions round trip.
  const names = page.value.data.some((row) => row.institutionId !== null)
    ? await resolveInstitutionNames(gateway)
    : new Map<string, string>();

  return {
    kind: 'ok',
    value: {
      data: page.value.data.map((row) =>
        toMobileAccount(
          row,
          row.institutionId === null ? null : (names.get(row.institutionId) ?? null)
        )
      ),
    },
  };
}

/**
 * One account and its month-end series.
 *
 * The account is what the screen is for, so a history that does not come back
 * is an empty series rather than a failed fetch: the dashboard drops its trend
 * and still shows the balance, the facts and the recent rows. The account
 * itself failing is a failure, and reaches the phone as one.
 */
export async function getAccountDetail(
  gateway: PillarGateway,
  id: string
): Promise<GatewayOutcome<MobileAccountDetail>> {
  const row = await fetchAccountRow(gateway, id);
  if (!isGatewayOk(row)) return row;

  const names =
    row.value.institutionId === null
      ? new Map<string, string>()
      : await resolveInstitutionNames(gateway);

  const historyOutcome = await gateway.call<FinanceAccountsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.checkpoints.history({ id, months: BALANCE_HISTORY_MONTHS })
  );
  const history = parseOrMismatch(
    FINANCE_PILLAR_ID,
    historyOutcome,
    FinanceBalanceHistoryResponseSchema,
    'checkpoints.history'
  );

  return {
    kind: 'ok',
    value: {
      account: toMobileAccount(
        row.value,
        row.value.institutionId === null ? null : (names.get(row.value.institutionId) ?? null)
      ),
      history: isGatewayOk(history) ? toMobileBalancePoints(history.value) : [],
    },
  };
}

/** Placeholder shown when an account lookup fails — a display nicety, not a hard dependency. */
const UNKNOWN_ACCOUNT_NAME = 'Unknown account';

/**
 * Resolve an account's display name for the transaction detail screen
 * (POPS-2770). Falls back to a placeholder rather than failing the whole
 * transaction fetch — a stale or unreachable account lookup should not stop
 * someone from reading the rest of the transaction they opened.
 */
export async function resolveAccountName(
  gateway: PillarGateway,
  accountId: string
): Promise<string> {
  const outcome = await fetchAccountRow(gateway, accountId);
  return isGatewayOk(outcome) ? outcome.value.name : UNKNOWN_ACCOUNT_NAME;
}
