/**
 * Resolves a transaction write's free-text `account` string to an
 * `accounts.id` (POPS-2767). `transactions.account_id` is `NOT NULL`, so
 * every insert must supply one; this is the one place that derivation
 * happens, shared by `createTransaction` and `insertImportTransaction` so
 * the two write paths cannot drift.
 *
 * Matches case-insensitively against `accounts.name`, the same collation
 * `idx_accounts_name_nocase` enforces uniqueness under. Throws
 * `UnresolvedAccountNameError` for no match — the same fail-loud rule
 * `0083_accounts.sql`'s backfill applies to historical rows, so `account`
 * and `account_id` can never silently drift apart on a new write either.
 */
import { sql } from 'drizzle-orm';

import { UnresolvedAccountNameError } from '../errors.js';
import { accounts } from '../schema.js';

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
