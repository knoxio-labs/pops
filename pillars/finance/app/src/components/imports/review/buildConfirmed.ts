import { isPendingContactId } from '@pops/finance';

import { requiresEntity } from '../../../lib/transaction-type';

import type { ConfirmedTransaction, ParsedTransaction } from '@pops/finance';

import type { ProcessedTransaction } from '../../../store/importStore';

/** Why a matched row cannot be committed as it stands, or `null` when it can. */
export type DropReason = 'entity' | 'type';

/**
 * Why a matched row would be dropped at commit, or `null` when it commits.
 *
 * Two things can be missing. A type that {@link requiresEntity} (a
 * `purchase`/`refund`, or an unset/unknown type) needs a resolved merchant
 * (`entityId` + `entityName`); the entity-optional types commit without one. A
 * `pending:contact:` id is not a resolved merchant, however complete the pair
 * looks: it is the placeholder a commit wrote when contacts could not be
 * reached, and a correction rule carrying one hands it to every future import
 * of the same merchant. Committing on it writes a transaction whose entity
 * resolves to nothing (POPS-2692).
 *
 * A **credit** (amount >= 0) additionally needs a type of its own. The pillar
 * refuses to store one without it rather than defaulting to `purchase`
 * (`commit-columns.ts`), so sending it would fail the whole batch — and the
 * default it replaced is what booked a `+$139.72` Apple refund as spend
 * (POPS-2754). Surfacing the row here makes it fixable in the Matched tab
 * instead.
 *
 * This is the single predicate behind both the commit filter and the
 * pre-commit count/notice, so the two can never drift (#3765).
 */
export function dropReason(t: ProcessedTransaction): DropReason | null {
  if (t.amount >= 0 && !t.transactionType) return 'type';
  const entityId = t.entity?.entityId;
  const hasEntity = Boolean(entityId && t.entity?.entityName && !isPendingContactId(entityId));
  if (requiresEntity(t.transactionType) && !hasEntity) return 'entity';
  return null;
}

/** Whether a matched row can actually be committed — see {@link dropReason}. */
export function isConfirmable(t: ProcessedTransaction): boolean {
  return dropReason(t) === null;
}

/**
 * Split the matched bucket into what will commit and what will be dropped, so
 * the Review step can show a truthful count and surface the dropped rows
 * instead of losing them silently (#3765). The two arrays are disjoint and
 * exhaustive over `matched`.
 */
export function partitionConfirmable(matched: ProcessedTransaction[]): {
  confirmed: ProcessedTransaction[];
  dropped: ProcessedTransaction[];
} {
  const confirmed: ProcessedTransaction[] = [];
  const dropped: ProcessedTransaction[] = [];
  for (const t of matched) (isConfirmable(t) ? confirmed : dropped).push(t);
  return { confirmed, dropped };
}

/**
 * Every field a row arrived with, carried to the wire unchanged.
 *
 * Listed exhaustively rather than spread from `t`, because a
 * {@link ProcessedTransaction} also holds review-only state (`entity`,
 * `status`, `matchedRules`) that must not reach the commit payload. The cost of
 * that is a list which silently goes stale: `country` and the three
 * foreign-charge columns were parsed, carried the whole way here, and then
 * dropped on this hop, which is why they were NULL on every stored row while
 * the ANZ parser that fills them was working correctly (POPS-2604). The
 * companion test enumerates `keyof ParsedTransaction`, so adding a field
 * without adding it here fails.
 */
function parsedFields(t: ProcessedTransaction): ParsedTransaction {
  return {
    date: t.date,
    description: t.description,
    amount: t.amount,
    account: t.account,
    accountId: t.accountId,
    location: t.location,
    country: t.country,
    foreignAmountMinor: t.foreignAmountMinor,
    foreignCurrency: t.foreignCurrency,
    fxFeeCents: t.fxFeeCents,
    fxCaptureSource: t.fxCaptureSource,
    rawRow: t.rawRow,
    checksum: t.checksum,
  };
}

export function buildConfirmedTransactions(
  matched: ProcessedTransaction[]
): ConfirmedTransaction[] {
  return matched.filter(isConfirmable).map((t) => ({
    ...parsedFields(t),
    transactionType: t.transactionType,
    entityId: t.entity?.entityId,
    entityName: t.entity?.entityName,
    tags: (t.suggestedTags ?? []).map((s) => s.tag),
    suggestedTags: t.suggestedTags,
    matchType: t.entity?.matchType,
    matchRuleId: t.ruleProvenance?.ruleId,
    matchConfidence: t.entity?.confidence,
  }));
}
