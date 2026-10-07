import { FinanceSummaryResponseSchema } from '../../contract/mobile-finance-summary-schemas.js';
import { FALLBACK_MOBILE_CURRENCY } from '../../contract/rest-schemas.js';
/**
 * bfm's finance leg: the mobile transaction screens, expressed as calls to the
 * finance pillar.
 *
 * Every call goes through the {@link PillarGateway}, so a half-broken
 * federation arrives here as a value with a kind rather than an exception —
 * and leaves here the same way. Nothing in this file throws, catches, or
 * substitutes an empty list for a failure: an empty page and "finance did not
 * answer" are different facts, and the phone renders them differently.
 *
 * Paging is keyset, not offset. Finance takes a `(beforeDate, beforeId)`
 * anchor and orders totally on the same pair, so a transaction imported while
 * somebody is mid-scroll cannot shift the window under them. The cursor the
 * app carries is that anchor, opaque — see `cursor.ts`.
 */
import {
  isGatewayOk,
  type GatewayFailure,
  type GatewayOutcome,
  type PillarGateway,
} from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { getAccountDetail, resolveAccount, resolveAccountCurrencies } from './accounts-client.js';
import { listAccounts, type ListAccountsRequest } from './accounts-list-client.js';
import { encodePageCursor, type PageCursor } from './cursor.js';
import {
  FinanceTransactionGetResponseSchema,
  FinanceTransactionListResponseSchema,
  toMobileTransaction,
  toMobileTransactionDetail,
} from './wire.js';
import {
  createMobileFinanceWriteOperations,
  type MobileFinanceWriteOperations,
} from './write-operations.js';

import type { z } from 'zod';

import type {
  MobileFinanceSummary,
  MobileFinanceSummaryQuery,
} from '../../contract/mobile-finance-summary-schemas.js';
import type {
  MobileAccountDetail,
  MobileAccountsPage,
  MobileTransactionDetail,
  MobileTransactionsPage,
} from '../../contract/rest-schemas.js';

export type { FinanceAccountsRouter } from './accounts-client.js';

/**
 * The subset of finance's router bfm calls. A `type` rather than an
 * `interface` so it satisfies the SDK proxy's `Record<string, unknown>`
 * constraint.
 *
 * This is an assertion about a peer, not a compile-time link to one — the
 * proxy resolves routes from finance's live OpenAPI. `wire.ts` validates what
 * comes back, which is where the actual guarantee lives.
 */
export type FinanceTransactionsRouter = {
  transactions: {
    list: (input: {
      limit?: number;
      beforeDate?: string;
      beforeId?: string;
      accountId?: string;
    }) => Promise<unknown>;
    get: (input: { id: string }) => Promise<unknown>;
  };
};

/** Finance's analytical summary operation used by the mobile fee summary route. */
export type FinanceSummaryRouter = {
  summary: {
    get: (input: MobileFinanceSummaryQuery) => Promise<unknown>;
  };
};

/** The finance pillar id — see `accounts-client.ts` for why there are two. */
export const FINANCE_PILLAR_ID = 'finance';

export interface ListTransactionsRequest {
  /** Rows to return. The caller has already clamped this to the contract's cap. */
  readonly limit: number;
  /** Where the previous page stopped, or `null` for the first page. */
  readonly cursor: PageCursor | null;
  /** One account's rows only, or `null` for every account. */
  readonly accountId: string | null;
}

/** Finance operations available to BFM's device-gated mobile routes. */
export interface MobileFinanceClient extends MobileFinanceWriteOperations {
  listTransactions(
    request: ListTransactionsRequest
  ): Promise<GatewayOutcome<MobileTransactionsPage>>;
  getTransaction(id: string): Promise<GatewayOutcome<MobileTransactionDetail>>;
  listAccounts(request: ListAccountsRequest): Promise<GatewayOutcome<MobileAccountsPage>>;
  getAccount(id: string): Promise<GatewayOutcome<MobileAccountDetail>>;
  /** Reads Finance's cost-of-credit measure for the requested window. */
  getSummary(query: MobileFinanceSummaryQuery): Promise<GatewayOutcome<MobileFinanceSummary>>;
}

export function createMobileFinanceClient(gateway: PillarGateway): MobileFinanceClient {
  return {
    async listTransactions(request: ListTransactionsRequest) {
      // One row past the page. Its existence is what proves another page
      // exists — asking finance for a total instead would be a second count
      // query per scroll tick, and a total that is stale the moment it is read.
      const outcome = await gateway.call<FinanceTransactionsRouter, unknown>(
        FINANCE_PILLAR_ID,
        (handle) =>
          handle.transactions.list({
            limit: request.limit + 1,
            beforeDate: request.cursor?.d,
            beforeId: request.cursor?.i,
            accountId: request.accountId ?? undefined,
          })
      );

      const page = parseOrMismatch(
        FINANCE_PILLAR_ID,
        outcome,
        FinanceTransactionListResponseSchema,
        'transactions.list'
      );
      if (!isGatewayOk(page)) return page;

      const currencies = await resolveAccountCurrencies(
        gateway,
        page.value.data.map((row) => row.accountId)
      );
      const mobilePage = toPage(page.value.data, request.limit, currencies);
      if (mobilePage === null) return amountContractMismatch();
      return { kind: 'ok', value: mobilePage };
    },

    async getTransaction(id: string) {
      const outcome = await gateway.call<FinanceTransactionsRouter, unknown>(
        FINANCE_PILLAR_ID,
        (handle) => handle.transactions.get({ id })
      );

      const record = parseOrMismatch(
        FINANCE_PILLAR_ID,
        outcome,
        FinanceTransactionGetResponseSchema,
        'transactions.get'
      );
      if (!isGatewayOk(record)) return record;

      const account = await resolveAccount(gateway, record.value.data.accountId);
      const transaction = toMobileTransactionDetail(
        record.value.data,
        account.name,
        account.currency
      );
      if (transaction === null) return amountContractMismatch();
      return {
        kind: 'ok',
        value: transaction,
      };
    },

    listAccounts: (request) => listAccounts(gateway, request),
    getAccount: (id: string) => getAccountDetail(gateway, id),
    getSummary: (query) => getFinanceSummary(gateway, query),
    ...createMobileFinanceWriteOperations(gateway),
  };
}

async function getFinanceSummary(
  gateway: PillarGateway,
  query: MobileFinanceSummaryQuery
): Promise<GatewayOutcome<MobileFinanceSummary>> {
  const outcome = await gateway.call<FinanceSummaryRouter, unknown>(FINANCE_PILLAR_ID, (handle) =>
    handle.summary.get(query)
  );

  const summary = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceSummaryResponseSchema,
    'summary.get'
  );
  if (!isGatewayOk(summary)) return summary;

  return { kind: 'ok', value: summary.value.data };
}

type FinanceListRows = z.infer<typeof FinanceTransactionListResponseSchema>['data'];

/**
 * Trim the probe row off the over-fetched page and mint the next cursor from
 * the last row actually served.
 *
 * The cursor comes from the last KEPT row, never the probe: it names the place
 * the app has read up to, and naming a row the app never saw would skip it.
 *
 * `currencies` resolves each row's OWN account (POPS-3571) — a page can span
 * several accounts once an `accountId` filter is not in play. A row whose
 * account is missing from the map (its own lookup failed) falls back to
 * {@link FALLBACK_MOBILE_CURRENCY} rather than failing the whole page over
 * one bad account.
 */
function toPage(
  rows: FinanceListRows,
  limit: number,
  currencies: ReadonlyMap<string, string>
): MobileTransactionsPage | null {
  const hasMore = rows.length > limit;
  const served = hasMore ? rows.slice(0, limit) : rows;
  const last = served.at(-1);
  const data: MobileTransactionsPage['data'] = [];

  for (const row of served) {
    const transaction = toMobileTransaction(
      row,
      currencies.get(row.accountId) ?? FALLBACK_MOBILE_CURRENCY
    );
    if (transaction === null) return null;
    data.push(transaction);
  }

  return {
    data,
    nextCursor:
      hasMore && last !== undefined ? encodePageCursor({ d: last.date, i: last.id }) : null,
  };
}

function amountContractMismatch(): GatewayFailure {
  return {
    kind: 'contract-mismatch',
    pillar: FINANCE_PILLAR_ID,
    status: 502,
    detail:
      'Finance returned a transaction amount that cannot be represented in its account currency',
  };
}
