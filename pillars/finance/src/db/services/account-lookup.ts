/**
 * Resolves a free-text account name to an `accounts.id`.
 *
 * Matches case-insensitively against `accounts.name`, the same collation
 * `idx_accounts_name_nocase` enforces uniqueness under. Throws
 * `UnresolvedAccountNameError` for no match.
 */
import { sql } from 'drizzle-orm';

import { UnresolvedAccountNameError } from '../errors.js';
import { accounts } from '../schema.js';
import { getAccount } from './accounts.js';

import type { FinanceDb } from './internal.js';

export function resolveAccountIdByName(db: FinanceDb, accountName: string): string {
  const row = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(sql`${accounts.name} = ${accountName} COLLATE NOCASE`)
    .get();
  if (!row) throw new UnresolvedAccountNameError(accountName);
  return row.id;
}

/**
 * Resolve an IMPORT row's account id: prefer the wizard's picked `accountId`
 * (POPS-2840) when present, validated with {@link getAccount} (throwing
 * `AccountNotFoundError` for a stale/bad id); otherwise fall back to
 * name-matching `dialectAccountLabel` exactly as {@link resolveAccountIdByName}
 * always has, for a caller with no picker (a legacy client, or a fixture
 * predating it).
 *
 * `dialectAccountLabel` here is the bank/dialect label stamped at parse time
 * (e.g. `"ANZ Credit Card"`, see `bank-dialect.ts`), not a claim about the
 * real account's own name — it is expected to disagree with the real
 * account's name whenever that account isn't literally named after its
 * dialect, which is the normal case (POPS-2852).
 */
export function resolveImportAccountId(
  db: FinanceDb,
  dialectAccountLabel: string,
  accountId: string | undefined
): string {
  if (accountId !== undefined) return getAccount(db, accountId).id;
  return resolveAccountIdByName(db, dialectAccountLabel);
}
