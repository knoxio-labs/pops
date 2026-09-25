/**
 * The bank transactions a purchase's charge links point at, described by
 * finance for the purchase detail's bank-match section (POPS-4646).
 *
 * One `transactions.list` narrowed by `ids` answers every link of a detail,
 * and one `accounts.list` names their accounts and currencies — two calls per detail, run
 * together, however many links it has. Either failing degrades rather than
 * failing the detail: the links still carry their own amount and method, so
 * an unreachable finance costs the descriptor, not the screen.
 */
import { FALLBACK_MOBILE_CURRENCY } from '../../contract/rest-schemas.js';
import { isGatewayOk, type PillarGateway } from '../pillars/gateway.js';
import { parseOrMismatch } from '../pillars/parse-response.js';
import { FinanceAccountListResponseSchema, FinanceTransactionListResponseSchema } from './wire.js';

import type { MobileMatchedTransaction } from '../../contract/mobile-purchase-bank-match-schemas.js';
import type { FinanceTransactionRow } from './wire.js';

/** The subset of finance's router this file calls. See `client.ts` for why it is an assertion. */
export type FinanceMatchedTransactionsRouter = {
  transactions: {
    list: (input: { ids: string[]; limit: number }) => Promise<unknown>;
  };
  accounts: {
    list: (input: { limit?: number }) => Promise<unknown>;
  };
};

/** See `accounts-client.ts` for why each file declares its own. */
const FINANCE_PILLAR_ID = 'finance';

/** Finance's own cap on both `ids` and `limit`. */
const FINANCE_LIST_CAP = 500;

/**
 * Describe each transaction in `ids` that finance holds, keyed by id. An id
 * finance does not answer for is absent from the map; a finance that does
 * not answer at all yields an empty map.
 */
export async function fetchMatchedTransactions(
  gateway: PillarGateway,
  ids: readonly string[]
): Promise<ReadonlyMap<string, MobileMatchedTransaction>> {
  const wanted = [...new Set(ids)].slice(0, FINANCE_LIST_CAP);
  if (wanted.length === 0) return new Map();

  const [transactions, accounts] = await Promise.all([
    fetchTransactions(gateway, wanted),
    fetchAccounts(gateway),
  ]);

  const described = new Map<string, MobileMatchedTransaction>();
  for (const row of transactions) {
    const account = accounts.get(row.accountId);
    described.set(row.id, {
      description: row.description,
      date: row.date,
      amount: row.amount,
      currency: account?.currency ?? FALLBACK_MOBILE_CURRENCY,
      accountName: account?.name ?? null,
    });
  }
  return described;
}

async function fetchTransactions(
  gateway: PillarGateway,
  ids: string[]
): Promise<FinanceTransactionRow[]> {
  const outcome = await gateway.call<FinanceMatchedTransactionsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.transactions.list({ ids, limit: ids.length })
  );
  const page = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceTransactionListResponseSchema,
    'transactions.list'
  );
  return isGatewayOk(page) ? page.value.data : [];
}

async function fetchAccounts(
  gateway: PillarGateway
): Promise<ReadonlyMap<string, { name: string; currency: string }>> {
  const outcome = await gateway.call<FinanceMatchedTransactionsRouter, unknown>(
    FINANCE_PILLAR_ID,
    (handle) => handle.accounts.list({ limit: FINANCE_LIST_CAP })
  );
  const page = parseOrMismatch(
    FINANCE_PILLAR_ID,
    outcome,
    FinanceAccountListResponseSchema,
    'accounts.list'
  );
  if (!isGatewayOk(page)) return new Map();
  return new Map(
    page.value.data.map((account) => [
      account.id,
      { name: account.name, currency: account.currency },
    ])
  );
}
