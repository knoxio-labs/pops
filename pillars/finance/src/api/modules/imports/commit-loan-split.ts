/**
 * Interest/principal split of an imported loan repayment (POPS-2830), applied
 * at commit time — after `transactionColumns` has shaped the confirmed wire
 * row into insert columns, but before `writeTransactionsPhase` writes it.
 *
 * Only a `transfer`-typed, positive-amount row against a `loan`-kind account
 * is a candidate: that is the shape a repayment credit takes (money reducing
 * the debt). Anything else on a loan account — a `fee` entered by hand, a
 * `loan`-typed drawdown, an outbound redraw — passes through as the single
 * row `transactionColumns` already built, unsplit.
 *
 * A loan account with no terms configured yet cannot be split (there is no
 * rate to compute interest from) — this degrades to importing the single
 * unsplit row rather than failing the whole commit over an assumption the
 * account owner hasn't recorded, and a zero-interest split (the very first
 * transaction on a fresh balance) is likewise left unsplit rather than
 * inserting a pointless zero-cent fee row.
 */
import {
  deriveLoanInterestChecksum,
  splitLoanRepaymentAmounts,
} from '../../../contract/loan-repayment-split.js';
import {
  accountsService,
  balanceAsOf,
  dayBefore,
  LoanTermsNotFoundError,
  loanTermsService,
  resolveImportAccountId,
  type FinanceDb,
} from '../../../db/index.js';
import { ValidationError } from '../../shared/errors.js';

import type { importsService } from '../../../db/index.js';

type Columns = Parameters<typeof importsService.insertImportTransaction>[1];

/**
 * `type: 'loan'` is reserved for the drawdown (POPS-2830) — the money the
 * lender advances — never for a repayment reducing the balance. A credit
 * (positive amount) against a loan account can only be money coming IN to pay
 * the loan down, which is structurally a repayment, so declaring it `loan`
 * is always a mistake and refused rather than silently accepted.
 */
function assertNotLoanTypedCredit(columns: Columns, isLoanAccount: boolean): void {
  if (isLoanAccount && columns.type === 'loan' && columns.amountCents > 0) {
    throw new ValidationError(
      { description: columns.description, amountCents: columns.amountCents },
      "'loan' is reserved for a drawdown; a positive amount against a loan account is a repayment, not a drawdown"
    );
  }
}

/** Rate + balance context the split formula needs, or `undefined` when unavailable. */
function loanSplitContext(
  db: FinanceDb,
  accountId: string,
  date: string
): { annualRatePct: number; balanceCents: number } | undefined {
  try {
    const annualRatePct = loanTermsService.getLoanRateAsOfDate(db, accountId, date);
    return {
      annualRatePct,
      balanceCents: balanceAsOf(db, accountId, dayBefore(date)).balanceCents,
    };
  } catch (error) {
    if (error instanceof LoanTermsNotFoundError) return undefined;
    throw error;
  }
}

/**
 * Split `columns` into its interest and principal legs when it is a
 * repayment against a loan account with terms on file, otherwise return it
 * unchanged as the sole element.
 *
 * The transfer/principal leg keeps the original checksum — re-import dedup
 * (`findExistingChecksums`) matches on it exactly as it would have matched
 * the un-split row, so a second import of the same statement line is
 * recognised as already committed and produces neither leg again. The fee/
 * interest leg's checksum is derived from it ({@link deriveLoanInterestChecksum}),
 * stable across re-imports and never colliding with a real bank checksum.
 */
export function expandLoanRepaymentRow(db: FinanceDb, columns: Columns): Columns[] {
  const accountId = resolveImportAccountId(db, columns.account, columns.accountId);
  const isLoanAccount = accountsService.getAccount(db, accountId).kind === 'loan';

  assertNotLoanTypedCredit(columns, isLoanAccount);

  if (!isLoanAccount || columns.type !== 'transfer' || columns.amountCents <= 0) {
    return [columns];
  }

  // The checksum is required on the wire (`ConfirmedTransactionSchema`) and
  // is only optional on `Columns` for callers that never import; a row that
  // reaches here without one carries no provenance to derive the interest
  // leg's checksum from, so it is left unsplit rather than risking an
  // unstable/colliding synthetic checksum.
  if (columns.checksum === undefined) return [columns];

  const context = loanSplitContext(db, accountId, columns.date);
  if (!context) return [columns];

  const { interestCents, principalCents } = splitLoanRepaymentAmounts({
    repaymentAmountCents: columns.amountCents,
    balanceCents: context.balanceCents,
    annualRatePct: context.annualRatePct,
  });
  if (interestCents <= 0) return [columns];

  const feeLeg: Columns = {
    ...columns,
    amountCents: interestCents,
    type: 'fee',
    tags: ['fee:interest'],
    entityId: null,
    entityName: null,
    checksum: deriveLoanInterestChecksum(columns.checksum),
    matchType: 'none',
    matchRuleId: null,
    matchConfidence: null,
  };
  const principalLeg: Columns = { ...columns, amountCents: principalCents };

  return [feeLeg, principalLeg];
}
