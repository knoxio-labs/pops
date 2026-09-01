/**
 * The confirmed wire row → the columns `insertImportTransaction` writes.
 *
 * Split out of `commit.ts` so the commit orchestration stays under the per-file
 * line cap: this is row shaping (optionals collapsed to column defaults,
 * provenance sanitised, `type` resolved), with no transaction or phase logic.
 */
import { resolveCommittedType } from '../../../contract/transaction-classification.js';
import { dollarsToCents } from '../../../money.js';
import { ValidationError } from '../../shared/errors.js';

import type { TransactionType } from '../../../contract/corrections-constants.js';
import type { FxCaptureSource } from '../../../contract/fx-capture.js';
import type { importsService } from '../../../db/index.js';
import type { CommitPayload } from './types.js';

type ConfirmedRow = CommitPayload['transactions'][number];

interface SanitizedProvenance {
  matchType: ConfirmedRow['matchType'] | null;
  matchRuleId: string | null;
  matchConfidence: number | null;
}

/**
 * Drop provenance fields that are meaningless for the given `matchType` before
 * persisting, so the DB never stores an inconsistent combination sent by a
 * client (e.g. `matchType: 'exact'` carrying a `matchRuleId`). A rule id is only
 * meaningful for `learned` matches; a confidence only for `ai`/`learned` ones.
 */
function sanitizeProvenance(txn: ConfirmedRow): SanitizedProvenance {
  const matchType = txn.matchType ?? null;
  const matchRuleId = matchType === 'learned' ? (txn.matchRuleId ?? null) : null;
  const matchConfidence =
    matchType === 'ai' || matchType === 'learned' ? (txn.matchConfidence ?? null) : null;
  return { matchType, matchRuleId, matchConfidence };
}

/**
 * The parsed row's foreign-charge fields, absent on a domestic charge, plus the
 * capture path that produced (or could not produce) them.
 *
 * `fxCaptureSource` is the one field here that stays NULL rather than
 * defaulting: it records who looked, so writing a value for a client that
 * declared none would be this pillar claiming a capture it did not run
 * (POPS-2647).
 */
function foreignChargeColumns(txn: ConfirmedRow): {
  foreignAmountMinor: number | null;
  foreignCurrency: string | null;
  fxFeeCents: number | null;
  fxCaptureSource: FxCaptureSource | null;
} {
  return {
    foreignAmountMinor: txn.foreignAmountMinor ?? null,
    foreignCurrency: txn.foreignCurrency ?? null,
    fxFeeCents: txn.fxFeeCents ?? null,
    fxCaptureSource: txn.fxCaptureSource ?? null,
  };
}

/**
 * The `type` a confirmed row is stored with.
 *
 * A debit with no declared type is a `purchase` — the one default the
 * classification ladder is allowed to assume, and the column is `NOT NULL` so
 * something must be written. A **credit** with no declared type is refused
 * instead of defaulted. `buildFromEntityMatch` deliberately leaves a positive
 * entity match untyped precisely so it cannot commit as a purchase, and this
 * default silently undid that: a `+$139.72 APPLE.COM/BILL` refund committed as
 * a `purchase` and subtracted $139.72 from the month's reported expenses
 * (POPS-2754). Refusing is safe because every credit that has been decided
 * carries its decision — a refund, a rebate, an inbound transfer all name their
 * type — so the only row this rejects is one nobody typed.
 */
function committedType(txn: ConfirmedRow, tags: string[]): TransactionType {
  if (txn.transactionType) return resolveCommittedType(txn.transactionType, tags);
  if (txn.amount >= 0) {
    throw new ValidationError(
      { description: txn.description, amount: txn.amount, date: txn.date },
      `Refusing to commit credit '${txn.description}' (${txn.amount}) with no transaction type: ` +
        'a positive amount is not a purchase, and this pillar will not guess which type it is'
    );
  }
  return resolveCommittedType('purchase', tags);
}

/**
 * The confirmed row as it is written: every wire optional collapsed to its
 * column default, and `type` resolved through {@link committedType} so a
 * gift-card purchase is stored as the transfer it is (POPS-2610) and an untyped
 * credit is refused rather than booked as spend (POPS-2754).
 */
export function transactionColumns(
  txn: ConfirmedRow,
  entityId: string | undefined
): Parameters<typeof importsService.insertImportTransaction>[1] {
  const provenance = sanitizeProvenance(txn);
  const tags = txn.tags ?? [];
  return {
    description: txn.description,
    account: txn.account,
    amountCents: dollarsToCents(txn.amount),
    date: txn.date,
    type: committedType(txn, tags),
    tags,
    entityId: entityId ?? null,
    entityName: txn.entityName ?? null,
    location: txn.location ?? null,
    country: txn.country ?? null,
    ...foreignChargeColumns(txn),
    rawRow: txn.rawRow,
    checksum: txn.checksum,
    matchType: provenance.matchType,
    matchRuleId: provenance.matchRuleId,
    matchConfidence: provenance.matchConfidence,
  };
}
