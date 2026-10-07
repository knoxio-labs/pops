/**
 * Data access for `account_grants` (POPS-5864, epic POPS-5827).
 *
 * Every email crosses {@link normalizeEmail} on the way in, for writes and for
 * lookups alike, so the spelling a caller holds never decides whether a grant
 * is found. Nothing here caches: a role is read from the table each time it is
 * asked for, which is what makes a change or a revocation take effect on the
 * grantee's next request.
 */
import { and, asc, eq, sql } from 'drizzle-orm';

import { normalizeEmail } from '@pops/pillar-sdk/access';

import { accountGrants } from '../schema.js';

import type { AccountGrantRole } from '../schema/account-grants.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `account_grants`. */
export type AccountGrantRow = typeof accountGrants.$inferSelect;

/** An account's grants, ordered by email so a listing is stable across calls. */
export function listGrantsForAccount(db: FinanceDb, accountId: string): AccountGrantRow[] {
  return db
    .select()
    .from(accountGrants)
    .where(eq(accountGrants.accountId, accountId))
    .orderBy(asc(accountGrants.email))
    .all();
}

/** Fields accepted by {@link upsertGrant}. */
export interface UpsertGrantInput {
  accountId: string;
  /** Any spelling of the address; it is normalised before it is stored. */
  email: string;
  role: AccountGrantRole;
  /**
   * Email of whoever is granting, recorded on a new row only. Null when the
   * caller carried no identity.
   */
  actor: string | null;
}

/**
 * Give an email a role on an account, or change the role it already holds.
 *
 * One email has at most one grant per account, so a repeat call keeps the
 * existing row, its id and who first granted it, and only moves the role.
 */
export function upsertGrant(db: FinanceDb, input: UpsertGrantInput): AccountGrantRow {
  return db
    .insert(accountGrants)
    .values({
      accountId: input.accountId,
      email: normalizeEmail(input.email),
      role: input.role,
      createdBy: input.actor === null ? null : normalizeEmail(input.actor),
    })
    .onConflictDoUpdate({
      target: [accountGrants.email, accountGrants.accountId],
      set: { role: sql`excluded.role` },
    })
    .returning()
    .get();
}

/**
 * Delete one grant of one account.
 *
 * Scoped by the account as well as the grant id so a grant id from one account
 * cannot be revoked through another's URL.
 *
 * @returns Whether a row was deleted.
 */
export function revokeGrant(db: FinanceDb, accountId: string, grantId: string): boolean {
  const deleted = db
    .delete(accountGrants)
    .where(and(eq(accountGrants.id, grantId), eq(accountGrants.accountId, accountId)))
    .returning({ id: accountGrants.id })
    .all();
  return deleted.length > 0;
}

/** Every account `email` has been granted, keyed by account id. */
export function grantsForEmail(db: FinanceDb, email: string): Map<string, AccountGrantRole> {
  const rows = db
    .select({ accountId: accountGrants.accountId, role: accountGrants.role })
    .from(accountGrants)
    .where(eq(accountGrants.email, normalizeEmail(email)))
    .all();
  return new Map(rows.map((row) => [row.accountId, row.role]));
}

/** The role `email` holds on the account, or `null` when it holds none. */
export function roleFor(db: FinanceDb, email: string, accountId: string): AccountGrantRole | null {
  const row = db
    .select({ role: accountGrants.role })
    .from(accountGrants)
    .where(
      and(eq(accountGrants.email, normalizeEmail(email)), eq(accountGrants.accountId, accountId))
    )
    .get();
  return row?.role ?? null;
}
