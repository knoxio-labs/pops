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
 *
 * {@link resolveAccountIdentity} extends this for the transition period
 * (POPS-2769) where a write may name the account by id instead of (or as
 * well as) by name.
 */
import { sql } from 'drizzle-orm';

import { AccountIdentityMismatchError, UnresolvedAccountNameError } from '../errors.js';
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

/** The resolved `(account name, account id)` pair a transaction write settles on. */
export interface ResolvedAccountIdentity {
  account: string;
  accountId: string;
}

/**
 * Resolve a transaction write's account identity from whichever of `account`
 * (free-text name) and `accountId` the caller supplied (POPS-2769).
 *
 * `accountId` takes precedence when both are present: it is looked up
 * directly via {@link getAccount} (throwing `AccountNotFoundError` for an
 * unknown id) rather than re-resolved by name, and the supplied `account`
 * string is validated against the looked-up account's real name
 * case-insensitively — a caller naming both sides only for them to disagree
 * (e.g. `account: 'Amex'` against an `accountId` that resolves to a
 * different account) is a bug in the caller, not a silent pick of one side,
 * so it throws `AccountIdentityMismatchError` instead.
 *
 * With only `account` supplied, resolves by name exactly as
 * {@link resolveAccountIdByName} always has. Throws if neither is supplied —
 * every call site must guard that itself, since "no identity given" means
 * different things to a create (never reaches here — `account` is required
 * on the wire) versus a patch (means "leave the account field alone", so the
 * call site skips calling this at all).
 */
export function resolveAccountIdentity(
  db: FinanceDb,
  account: string | undefined,
  accountId: string | undefined
): ResolvedAccountIdentity {
  if (accountId !== undefined) {
    const row = getAccount(db, accountId);
    if (account !== undefined && row.name.toLowerCase() !== account.toLowerCase()) {
      throw new AccountIdentityMismatchError(account, accountId, row.name);
    }
    return { account: row.name, accountId: row.id };
  }
  if (account !== undefined) {
    return { account, accountId: resolveAccountIdByName(db, account) };
  }
  throw new Error('resolveAccountIdentity requires account or accountId');
}

/**
 * Resolve an IMPORT row's account id: prefer the wizard's picked `accountId`
 * (POPS-2840) when present, validated with {@link getAccount} (throwing
 * `AccountNotFoundError` for a stale/bad id); otherwise fall back to
 * name-matching `account` exactly as {@link resolveAccountIdByName} always
 * has, for a caller with no picker (a legacy client, or a fixture predating
 * it).
 *
 * Deliberately NOT {@link resolveAccountIdentity}: that function's mismatch
 * check assumes `account` is a claim about the real account's own name, which
 * holds for a manually created/edited transaction but not for an import row.
 * There, `account` is the bank/dialect label stamped at parse time (e.g.
 * `"ANZ Credit Card"`, see `column-map/validation.ts`) — expected to disagree
 * with the real account's name whenever that account isn't literally named
 * after its dialect, which is the normal case, not a caller bug. Applying
 * `resolveAccountIdentity`'s check here would throw `AccountIdentityMismatchError`
 * on nearly every import row (POPS-2852).
 */
export function resolveImportAccountId(
  db: FinanceDb,
  account: string,
  accountId: string | undefined
): string {
  if (accountId !== undefined) return getAccount(db, accountId).id;
  return resolveAccountIdByName(db, account);
}
