import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { matchesMobileAccountSearch } from './account-search.js';
import { encodeAccountsCursor, type AccountsCursor } from './accounts-cursor.js';
import { FinanceAccountListResponseSchema, toMobileAccount } from './wire.js';

import type { MobileAccountsPage, MobileAccountsQuery } from '../../contract/account.js';
import type { FinanceAccountRow } from './wire.js';

type FinanceAccountsListRouter = {
  accounts: {
    list: (input: {
      limit?: number;
      offset?: number;
      kind?: string;
      archived?: 'true' | 'false';
    }) => Promise<unknown>;
  };
};

/** The finance accounts-list page request after cursor validation. */
export interface ListAccountsRequest {
  readonly query: Pick<MobileAccountsQuery, 'search' | 'kind' | 'archived'>;
  readonly cursor: AccountsCursor | null;
  readonly limit: number;
}

/**
 * Finance's accounts list cap. Resolved institution/contact labels are part
 * of mobile search, so BFM reads each bounded finance page before applying
 * that predicate and its own response limit.
 */
const ACCOUNT_LIST_LIMIT = 500;

/** The finance pillar id, repeated here for the static cross-pillar audit. */
const FINANCE_PILLAR_ID = 'finance';

/** Fetch all finance pages needed before the mobile account predicate runs. */
async function fetchFinanceAccountRows(
  gateway: PillarGateway,
  request: ListAccountsRequest
): Promise<GatewayOutcome<FinanceAccountRow[]>> {
  const rows: FinanceAccountRow[] = [];
  let offset = 0;
  let expectedTotal: number | undefined;

  while (true) {
    const outcome = await gateway.call<FinanceAccountsListRouter, unknown>(
      FINANCE_PILLAR_ID,
      (handle) =>
        handle.accounts.list({
          limit: ACCOUNT_LIST_LIMIT,
          offset,
          ...(request.query.kind === undefined ? {} : { kind: request.query.kind }),
          ...(request.query.archived === undefined ? {} : { archived: request.query.archived }),
        })
    );

    const page = parseOrMismatch(
      FINANCE_PILLAR_ID,
      outcome,
      FinanceAccountListResponseSchema,
      'accounts.list'
    );
    if (!isGatewayOk(page)) return page;

    const pagination = page.value.pagination;
    if (
      pagination.offset !== offset ||
      pagination.limit !== ACCOUNT_LIST_LIMIT ||
      (expectedTotal !== undefined && pagination.total !== expectedTotal) ||
      page.value.data.length > pagination.limit ||
      (pagination.hasMore && page.value.data.length === 0) ||
      pagination.hasMore !== offset + pagination.limit < pagination.total
    ) {
      return { kind: 'contract-mismatch', pillar: FINANCE_PILLAR_ID, status: 502 };
    }

    expectedTotal = pagination.total;
    rows.push(...page.value.data);
    if (!pagination.hasMore) break;
    offset += pagination.limit;
  }

  return { kind: 'ok', value: rows };
}

/** Return one mobile account page after search, kind, and archive filtering. */
export async function listAccounts(
  gateway: PillarGateway,
  request: ListAccountsRequest
): Promise<GatewayOutcome<MobileAccountsPage>> {
  const outcome = await fetchFinanceAccountRows(gateway, request);
  if (!isGatewayOk(outcome)) return outcome;

  const accounts = outcome.value
    .map(toMobileAccount)
    .filter((account) =>
      request.query.search === undefined
        ? true
        : matchesMobileAccountSearch(account, request.query.search)
    );
  const anchorIndex =
    request.cursor === null
      ? -1
      : accounts.findIndex((account) => account.id === request.cursor?.id);
  if (request.cursor !== null && anchorIndex < 0) {
    return { kind: 'invalid-request', pillar: FINANCE_PILLAR_ID, status: 400 };
  }

  const start = anchorIndex + 1;
  const page = accounts.slice(start, start + request.limit);
  const last = page.at(-1);
  const hasMore = start + page.length < accounts.length;
  return {
    kind: 'ok',
    value: {
      accounts: page,
      nextCursor:
        hasMore && last !== undefined ? encodeAccountsCursor(last.id, request.query) : null,
      totalCount: accounts.length,
    },
  };
}
