/**
 * Loan terms and rate history for a `loan`-kind account (POPS-2829).
 *
 * The two live in one service because they are one decision. `loan_terms`
 * carries `annual_rate_pct` as a real column — the loan's CURRENT rate, the
 * field every read wants — and `loan_rate_history` carries every rate the
 * loan has ever had. Nothing may leave the two disagreeing, so every write
 * that changes a rate writes both sides inside a single `db.transaction`.
 *
 * The cheap way to keep that mirror honest is to allow rates only strictly
 * forward in time: a rate whose `effective_from` is not later than every row
 * already stored is rejected (`LoanRateNotLatestError`). So "the row just
 * written" and "the latest row" are always the same row, and the column
 * follows without a max-per-loan recomputation. The cost is that backdated
 * rate corrections are impossible for now — a deliberate simplification, and
 * the constraint a later ticket would lift.
 *
 * The one exception is a re-write of the terms at their OWN
 * `terms_effective_from`: `writeLoanTerms` is create-or-replace, so
 * re-sending the same effective date updates that history row in place
 * rather than being rejected as not-later. Correcting a typo'd rate must not
 * require inventing a new effective date.
 *
 * Only a `loan`-kind account may carry rows here, checked against the
 * account's live `kind` on every call — `accounts.kind` can be changed out
 * from under an existing row by a later `PATCH /accounts/:id`, and there is
 * no SQL constraint that can express "this FK's target row must have
 * `kind = X`".
 */
import { desc, eq } from 'drizzle-orm';

import {
  AccountKindMismatchError,
  AccountNotFoundError,
  LoanRateNotLatestError,
  LoanTermsNotFoundError,
} from '../errors.js';
import { accounts, loanRateHistory, loanTerms } from '../schema.js';

import type { LoanRateSource } from '../../contract/loan.js';
import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for `loan_terms`. */
export type LoanTermsRow = typeof loanTerms.$inferSelect;

/** Raw drizzle row shape for `loan_rate_history`. */
export type LoanRateHistoryRow = typeof loanRateHistory.$inferSelect;

/**
 * Fields accepted by {@link writeLoanTerms}. Money is integer cents; the
 * rate is a percentage (`5.49` = 5.49% p.a.). `source` is not accepted —
 * `manual` is its only possible value today (see `LOAN_TERMS_SOURCES`).
 */
export interface WriteLoanTermsInput {
  originalPrincipalCents: number;
  annualRatePct: number;
  termMonths: number;
  monthlyRepaymentCents: number;
  startedOn: string;
  termsEffectiveFrom: string;
}

/** Fields accepted by {@link recordLoanRate}. */
export interface RecordLoanRateInput {
  annualRatePct: number;
  effectiveFrom: string;
  source: LoanRateSource;
}

/**
 * Throws `AccountNotFoundError` if `accountId` names no account, or
 * `AccountKindMismatchError` if it exists but isn't `kind: 'loan'`.
 */
function requireLoanAccount(db: FinanceDb, accountId: string): void {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) throw new AccountNotFoundError(accountId);
  if (account.kind !== 'loan') {
    throw new AccountKindMismatchError(accountId, account.kind, 'loan');
  }
}

function latestRateRow(db: FinanceDb, accountId: string): LoanRateHistoryRow | undefined {
  return db
    .select()
    .from(loanRateHistory)
    .where(eq(loanRateHistory.loanAccountId, accountId))
    .orderBy(desc(loanRateHistory.effectiveFrom))
    .limit(1)
    .get();
}

/**
 * Read a loan account's terms. Throws
 * `AccountNotFoundError`/`AccountKindMismatchError` per
 * {@link requireLoanAccount}, or `LoanTermsNotFoundError` if the account is a
 * loan but has no terms written yet.
 */
export function getLoanTerms(db: FinanceDb, accountId: string): LoanTermsRow {
  requireLoanAccount(db, accountId);
  const row = db.select().from(loanTerms).where(eq(loanTerms.accountId, accountId)).get();
  if (!row) throw new LoanTermsNotFoundError(accountId);
  return row;
}

/**
 * Create, or fully replace, a loan account's terms, seeding/updating the
 * matching `loan_rate_history` row in the same transaction so the two can
 * never disagree.
 *
 * The history row written is the one at `input.termsEffectiveFrom`: inserted
 * when that date is later than everything stored (or nothing is stored yet),
 * updated in place when it equals the latest stored date. Throws
 * `LoanRateNotLatestError` when it is EARLIER than the latest stored rate —
 * accepting it would leave `annual_rate_pct` mirroring a row that is no
 * longer the latest.
 */
export function writeLoanTerms(
  db: FinanceDb,
  accountId: string,
  input: WriteLoanTermsInput
): LoanTermsRow {
  requireLoanAccount(db, accountId);

  const latest = latestRateRow(db, accountId);
  if (latest && input.termsEffectiveFrom < latest.effectiveFrom) {
    throw new LoanRateNotLatestError(accountId, input.termsEffectiveFrom, latest.effectiveFrom);
  }

  const now = new Date().toISOString();
  db.transaction((tx) => {
    tx.insert(loanTerms)
      .values({ accountId, ...input })
      .onConflictDoUpdate({
        target: loanTerms.accountId,
        set: { ...input, updatedAt: now },
      })
      .run();

    if (latest && input.termsEffectiveFrom === latest.effectiveFrom) {
      tx.update(loanRateHistory)
        .set({ annualRatePct: input.annualRatePct })
        .where(eq(loanRateHistory.id, latest.id))
        .run();
      return;
    }
    tx.insert(loanRateHistory)
      .values({
        loanAccountId: accountId,
        annualRatePct: input.annualRatePct,
        effectiveFrom: input.termsEffectiveFrom,
        source: 'manual',
      })
      .run();
  });

  return getLoanTerms(db, accountId);
}

/**
 * Every rate the loan has carried, newest `effective_from` first. Throws
 * `AccountNotFoundError`/`AccountKindMismatchError` per
 * {@link requireLoanAccount}. An account with terms always has at least one
 * row, since {@link writeLoanTerms} seeds one.
 */
export function listLoanRateHistory(db: FinanceDb, accountId: string): LoanRateHistoryRow[] {
  requireLoanAccount(db, accountId);
  return db
    .select()
    .from(loanRateHistory)
    .where(eq(loanRateHistory.loanAccountId, accountId))
    .orderBy(desc(loanRateHistory.effectiveFrom))
    .all();
}

/**
 * Record a rate change, updating `loan_terms.annual_rate_pct` to match in
 * the same transaction.
 *
 * Throws `LoanTermsNotFoundError` if the account has no terms yet — there
 * would be no `annual_rate_pct` to keep in step, and a rate on its own says
 * nothing about a loan the ledger knows no other fact about. Throws
 * `LoanRateNotLatestError` if `effectiveFrom` is not strictly later than the
 * latest recorded rate; see that error for why backdating is refused.
 */
export function recordLoanRate(
  db: FinanceDb,
  accountId: string,
  input: RecordLoanRateInput
): LoanRateHistoryRow {
  getLoanTerms(db, accountId);

  const latest = latestRateRow(db, accountId);
  if (latest && input.effectiveFrom <= latest.effectiveFrom) {
    throw new LoanRateNotLatestError(accountId, input.effectiveFrom, latest.effectiveFrom);
  }

  return db.transaction((tx) => {
    const row = tx
      .insert(loanRateHistory)
      .values({
        loanAccountId: accountId,
        annualRatePct: input.annualRatePct,
        effectiveFrom: input.effectiveFrom,
        source: input.source,
      })
      .returning()
      .get();
    tx.update(loanTerms)
      .set({ annualRatePct: input.annualRatePct, updatedAt: new Date().toISOString() })
      .where(eq(loanTerms.accountId, accountId))
      .run();
    return row;
  });
}
