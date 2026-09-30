import { AccountNotFoundError, accountsService } from '../../db/index.js';
import { toTransaction } from './transactions-types.js';

import type { FinanceDb, TransactionRow } from '../../db/index.js';
import type { Transaction } from './transactions-types.js';

/** Map a transaction using the currency of the account that denominates its amount. */
export function toTransactionWithAccountCurrency(db: FinanceDb, row: TransactionRow): Transaction {
  return toTransaction(row, accountsService.getAccount(db, row.accountId).currency);
}

/**
 * Map a transaction page with one account-currency lookup for the whole page.
 * Throws `AccountNotFoundError` when a transaction references no account.
 */
export function toTransactions(db: FinanceDb, rows: TransactionRow[]): Transaction[] {
  const currencies = accountsService.currenciesForAccountIds(
    db,
    rows.map((row) => row.accountId)
  );

  return rows.map((row) => {
    const currency = currencies.get(row.accountId);
    if (currency === undefined) throw new AccountNotFoundError(row.accountId);
    return toTransaction(row, currency);
  });
}
