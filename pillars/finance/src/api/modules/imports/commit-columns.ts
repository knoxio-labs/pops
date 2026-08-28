/**
 * The confirmed wire row → the columns `insertImportTransaction` writes.
 *
 * Split out of `commit.ts` so the commit orchestration stays under the per-file
 * line cap: this is row shaping (optionals collapsed to column defaults,
 * provenance sanitised, `type` resolved), with no transaction or phase logic.
 */
import { resolveCommittedType } from '../../../contract/transaction-classification.js';
import { dollarsToCents } from '../../../money.js';

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

/** The parsed row's foreign-charge fields, absent on a domestic charge. */
function foreignChargeColumns(txn: ConfirmedRow): {
  foreignAmountMinor: number | null;
  foreignCurrency: string | null;
  fxFeeCents: number | null;
} {
  return {
    foreignAmountMinor: txn.foreignAmountMinor ?? null,
    foreignCurrency: txn.foreignCurrency ?? null,
    fxFeeCents: txn.fxFeeCents ?? null,
  };
}

/**
 * The confirmed row as it is written: every wire optional collapsed to its
 * column default, and `type` resolved through {@link resolveCommittedType} so a
 * gift-card purchase is stored as the transfer it is (POPS-2610).
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
    type: resolveCommittedType(txn.transactionType ?? 'purchase', tags),
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
