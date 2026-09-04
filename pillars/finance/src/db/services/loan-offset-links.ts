/**
 * Offset-account links for a `loan`-kind account (POPS-2829).
 *
 * Unlinking sets `unlinked_at` rather than deleting the row, so a past
 * offset arrangement stays readable. `idx_loan_offset_links_active_pair` is
 * a PARTIAL unique index — one active link per (loan, offset) pair, any
 * number of closed ones — which is what makes re-linking after an unlink
 * work at all.
 *
 * The loan side is kind-gated the same way `loan-terms.ts` gates it. The
 * offset side is NOT: it must exist, but any kind of account may offset a
 * loan.
 */
import { and, asc, eq, isNull } from 'drizzle-orm';

import {
  AccountKindMismatchError,
  AccountNotFoundError,
  LoanOffsetLinkConflictError,
  LoanOffsetLinkNotFoundError,
  LoanOffsetLinkSelfLinkError,
} from '../errors.js';
import { accounts, loanOffsetLinks } from '../schema.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `loan_offset_links`. */
export type LoanOffsetLinkRow = typeof loanOffsetLinks.$inferSelect;

/** Fields accepted by {@link linkOffsetAccount}. */
export interface LinkOffsetAccountInput {
  offsetAccountId: string;
  linkedFrom: string;
}

function requireLoanAccount(db: FinanceDb, accountId: string): void {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) throw new AccountNotFoundError(accountId);
  if (account.kind !== 'loan') {
    throw new AccountKindMismatchError(accountId, account.kind, 'loan');
  }
}

function requireAccountExists(db: FinanceDb, accountId: string): void {
  const account = db
    .select({ id: accounts.id })
    .from(accounts)
    .where(eq(accounts.id, accountId))
    .get();
  if (!account) throw new AccountNotFoundError(accountId);
}

/**
 * List a loan's offset links, oldest `linkedFrom` first. Pass
 * `activeOnly: true` to drop the closed ones. Throws
 * `AccountNotFoundError`/`AccountKindMismatchError` if the loan side is not a
 * `loan`-kind account.
 */
export function listOffsetLinks(
  db: FinanceDb,
  loanAccountId: string,
  activeOnly = false
): LoanOffsetLinkRow[] {
  requireLoanAccount(db, loanAccountId);
  const conditions = [eq(loanOffsetLinks.loanAccountId, loanAccountId)];
  if (activeOnly) conditions.push(isNull(loanOffsetLinks.unlinkedAt));
  return db
    .select()
    .from(loanOffsetLinks)
    .where(and(...conditions))
    .orderBy(asc(loanOffsetLinks.linkedFrom))
    .all();
}

/**
 * Link an offset account to a loan. Throws `AccountNotFoundError` for either
 * side, `AccountKindMismatchError` if the loan side is not `kind: 'loan'`,
 * `LoanOffsetLinkSelfLinkError` if the offset account IS the loan account,
 * and `LoanOffsetLinkConflictError` if the pair already has an active link.
 *
 * The conflict is pre-checked rather than mapped from the partial unique
 * index: better-sqlite3 is synchronous and this pillar is single-process, so
 * the read and the insert cannot interleave with another write. The index
 * remains the storage-level statement of the same rule.
 */
export function linkOffsetAccount(
  db: FinanceDb,
  loanAccountId: string,
  input: LinkOffsetAccountInput
): LoanOffsetLinkRow {
  requireLoanAccount(db, loanAccountId);
  requireAccountExists(db, input.offsetAccountId);
  if (input.offsetAccountId === loanAccountId) {
    throw new LoanOffsetLinkSelfLinkError(loanAccountId);
  }

  const active = db
    .select()
    .from(loanOffsetLinks)
    .where(
      and(
        eq(loanOffsetLinks.loanAccountId, loanAccountId),
        eq(loanOffsetLinks.offsetAccountId, input.offsetAccountId),
        isNull(loanOffsetLinks.unlinkedAt)
      )
    )
    .get();
  if (active) throw new LoanOffsetLinkConflictError(loanAccountId, input.offsetAccountId);

  return db
    .insert(loanOffsetLinks)
    .values({
      loanAccountId,
      offsetAccountId: input.offsetAccountId,
      linkedFrom: input.linkedFrom,
    })
    .returning()
    .get();
}

/**
 * Close an offset link by stamping `unlinked_at`, keeping the row. Throws
 * `LoanOffsetLinkNotFoundError` if `linkId` names no link on this loan.
 * Idempotent — unlinking an already-closed link leaves its original
 * `unlinkedAt` untouched rather than bumping it.
 */
export function unlinkOffsetAccount(
  db: FinanceDb,
  loanAccountId: string,
  linkId: string
): LoanOffsetLinkRow {
  requireLoanAccount(db, loanAccountId);
  const link = db
    .select()
    .from(loanOffsetLinks)
    .where(and(eq(loanOffsetLinks.id, linkId), eq(loanOffsetLinks.loanAccountId, loanAccountId)))
    .get();
  if (!link) throw new LoanOffsetLinkNotFoundError(linkId);
  if (link.unlinkedAt !== null) return link;

  return db
    .update(loanOffsetLinks)
    .set({ unlinkedAt: new Date().toISOString() })
    .where(eq(loanOffsetLinks.id, linkId))
    .returning()
    .get();
}
