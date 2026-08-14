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
import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { encodePageCursor, type PageCursor } from './cursor.js';
import {
  FinanceTransactionGetResponseSchema,
  FinanceTransactionListResponseSchema,
  toMobileTransaction,
  toMobileTransactionDetail,
} from './wire.js';

import type { z } from 'zod';

import type {
  MobileTransactionDetail,
  MobileTransactionsPage,
} from '../../contract/rest-schemas.js';

/** The finance pillar id, as registered with the registry. */
export const FINANCE_PILLAR_ID = 'finance';

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
    list: (input: { limit?: number; beforeDate?: string; beforeId?: string }) => Promise<unknown>;
    get: (input: { id: string }) => Promise<unknown>;
  };
};

export interface ListTransactionsRequest {
  /** Rows to return. The caller has already clamped this to the contract's cap. */
  readonly limit: number;
  /** Where the previous page stopped, or `null` for the first page. */
  readonly cursor: PageCursor | null;
}

export interface MobileFinanceClient {
  listTransactions(
    request: ListTransactionsRequest
  ): Promise<GatewayOutcome<MobileTransactionsPage>>;
  getTransaction(id: string): Promise<GatewayOutcome<MobileTransactionDetail>>;
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
          })
      );

      const page = parseOrMismatch(
        FINANCE_PILLAR_ID,
        outcome,
        FinanceTransactionListResponseSchema,
        'transactions.list'
      );
      if (!isGatewayOk(page)) return page;

      return { kind: 'ok', value: toPage(page.value.data, request.limit) };
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

      return { kind: 'ok', value: toMobileTransactionDetail(record.value.data) };
    },
  };
}

type FinanceListRows = z.infer<typeof FinanceTransactionListResponseSchema>['data'];

/**
 * Trim the probe row off the over-fetched page and mint the next cursor from
 * the last row actually served.
 *
 * The cursor comes from the last KEPT row, never the probe: it names the place
 * the app has read up to, and naming a row the app never saw would skip it.
 */
function toPage(rows: FinanceListRows, limit: number): MobileTransactionsPage {
  const hasMore = rows.length > limit;
  const served = hasMore ? rows.slice(0, limit) : rows;
  const last = served.at(-1);

  return {
    data: served.map(toMobileTransaction),
    nextCursor:
      hasMore && last !== undefined ? encodePageCursor({ d: last.date, i: last.id }) : null,
  };
}
