import { isGatewayOk, type GatewayOutcome, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { encodeAccountsCursor, type AccountsCursor } from './accounts-cursor.js';
import { FinanceAccountListResponseSchema, toMobileAccount } from './wire.js';

import type { MobileAccountsPage, MobileAccountsQuery } from '../../contract/account.js';
import type { FinanceAccountRow } from './wire.js';

type FinanceAccountsListRouter = {
  accounts: {
    list: (input: {
      limit?: number;
      offset?: number;
      search?: string;
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

/** The finance pillar id, repeated here for the static cross-pillar audit. */
const FINANCE_PILLAR_ID = 'finance';

/** Fetch one bounded Finance page with the mobile list's filters applied upstream. */
async function fetchFinanceAccountPage(
  gateway: PillarGateway,
  request: ListAccountsRequest
): Promise<GatewayOutcome<{ rows: FinanceAccountRow[]; total: number; offset: number }>> {
  const offset = request.cursor?.offset ?? 0;
  const financeLimit = request.limit + 1;
  const outcome = await gateway.call<FinanceAccountsListRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) =>
      handle.accounts.list({
        limit: financeLimit,
        offset,
        ...(request.query.search === undefined ? {} : { search: request.query.search }),
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
  const expectedLength = Math.min(financeLimit, Math.max(pagination.total - offset, 0));
  if (
    pagination.offset !== offset ||
    pagination.limit !== financeLimit ||
    page.value.data.length !== expectedLength ||
    pagination.hasMore !== offset + pagination.limit < pagination.total
  ) {
    return { kind: 'contract-mismatch', pillar: FINANCE_PILLAR_ID, status: 502 };
  }

  return {
    kind: 'ok',
    value: { rows: page.value.data, total: pagination.total, offset },
  };
}

/** Return one bounded mobile account page after Finance applies search and filters. */
export async function listAccounts(
  gateway: PillarGateway,
  request: ListAccountsRequest
): Promise<GatewayOutcome<MobileAccountsPage>> {
  const outcome = await fetchFinanceAccountPage(gateway, request);
  if (!isGatewayOk(outcome)) return outcome;

  const rows = outcome.value.rows.slice(0, request.limit);
  const accounts = rows.map(toMobileAccount);
  const nextOffset = outcome.value.offset + rows.length;
  const hasMore = nextOffset < outcome.value.total;
  return {
    kind: 'ok',
    value: {
      accounts,
      nextCursor: hasMore ? encodeAccountsCursor(nextOffset, request.query) : null,
      totalCount: outcome.value.total,
    },
  };
}
