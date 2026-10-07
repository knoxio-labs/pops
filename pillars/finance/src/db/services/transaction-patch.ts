/**
 * What a PATCH to a transaction may change, and the checks it must pass
 * against the row it lands on.
 *
 * Split from `transactions.ts`, which is at its per-file line cap; the writer
 * that runs these stays there.
 */
import { isPositiveAmountPurchase } from '../../contract/corrections-constants.js';
import { PositiveAmountPurchaseError } from '../errors.js';
import { assertTagsWithinFacetCardinality } from '../facet-cardinality-guard.js';
import { assertNoFeeTagsOnNonFeeType } from '../fee-tag-guard.js';
import { parseStoredTags } from '../tag-facets.js';
import { getAccount } from './accounts.js';

import type { TransactionType } from '../../contract/corrections-constants.js';
import type { transactions } from '../schema.js';
import type { FinanceDb, TransactionRow } from './internal.js';

/** Same shape as create — all fields optional for PATCH semantics. */
export interface UpdateTransactionInput {
  description?: string;
  /** FK to `accounts.id`. Throws `AccountNotFoundError` for an unknown id. */
  accountId?: string;
  amountCents?: number;
  date?: string;
  type?: TransactionType;
  tags?: string[];
  entityId?: string | null;
  entityName?: string | null;
  location?: string | null;
  country?: string | null;
  relatedTransactionId?: string | null;
  notes?: string | null;
}

/** The columns an UPDATE may set. */
export type TransactionUpdate = Partial<typeof transactions.$inferInsert>;

function applyCoreFields(
  db: FinanceDb,
  input: UpdateTransactionInput,
  updates: TransactionUpdate
): void {
  if (input.description !== undefined) updates.description = input.description;
  if (input.accountId !== undefined) {
    updates.accountId = getAccount(db, input.accountId).id;
  }
  if (input.amountCents !== undefined) updates.amountCents = input.amountCents;
  if (input.date !== undefined) updates.date = input.date;
  if (input.type !== undefined) updates.type = input.type;
  if (input.tags !== undefined) updates.tags = JSON.stringify(input.tags);
}

function applyEntityFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.entityId !== undefined) updates.entityId = input.entityId ?? null;
  if (input.entityName !== undefined) updates.entityName = input.entityName ?? null;
}

function applyLocationFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.location !== undefined) updates.location = input.location ?? null;
  if (input.country !== undefined) updates.country = input.country ?? null;
}

function applyMetadataFields(input: UpdateTransactionInput, updates: TransactionUpdate): void {
  if (input.relatedTransactionId !== undefined) {
    updates.relatedTransactionId = input.relatedTransactionId ?? null;
  }
  if (input.notes !== undefined) updates.notes = input.notes ?? null;
}

/**
 * The classification fields a direct PATCH must touch to count as a manual
 * override (CF017/#3623): doing so stamps `matchType: 'manual'` and clears
 * the stale rule-match provenance so a future reclassify pass leaves the row
 * alone instead of silently reverting the user's hand-fix.
 *
 * `buildRetroactiveApplyUpdates` (`reclassifyExistingTransactions`/
 * `applyCorrectionRuleToExistingTransactions`) also merges `tags` and stamps
 * match-provenance columns on a reclassify pass, but a `tags`-only PATCH is
 * deliberately excluded from this list: tag merging is additive-only, so
 * re-merging a rule's tags onto a row the user only re-tagged (rather than
 * reclassified) never reverts anything.
 */
const CLASSIFICATION_PATCH_FIELDS = ['entityId', 'entityName', 'type', 'location'] as const;

function touchesClassificationFields(input: UpdateTransactionInput): boolean {
  return CLASSIFICATION_PATCH_FIELDS.some((field) => input[field] !== undefined);
}

/** The column changes a PATCH asks for, with the manual-override stamp where it applies. */
export function buildTransactionUpdates(
  db: FinanceDb,
  input: UpdateTransactionInput
): TransactionUpdate {
  const updates: TransactionUpdate = {};
  applyCoreFields(db, input, updates);
  applyEntityFields(input, updates);
  applyLocationFields(input, updates);
  applyMetadataFields(input, updates);
  if (touchesClassificationFields(input)) {
    updates.matchType = 'manual';
    updates.matchRuleId = null;
    updates.matchConfidence = null;
  }
  return updates;
}

/**
 * A PATCH is checked against the row it lands on, not against itself.
 *
 * This is the reason the guard lives in the service rather than in the zod
 * body: `UpdateTransactionBody` makes `amount` and `type` independently
 * optional, so `{ type: 'purchase' }` alone is a valid body and a schema
 * refinement cannot see the stored amount it would contradict. That is exactly
 * how POPS-2680's rows were produced — their `match_type` is `prefix`,
 * `learned` and `manual`, i.e. through review and the editor, never through
 * the automatic default.
 */
export function assertPatchStaysCoherent(
  stored: TransactionRow,
  input: UpdateTransactionInput
): void {
  const amountCents = input.amountCents ?? stored.amountCents;
  const type = input.type ?? stored.type;
  if (isPositiveAmountPurchase(amountCents, type)) {
    throw new PositiveAmountPurchaseError(amountCents);
  }
  // Only the tags this PATCH sends are judged. A stored row already over the
  // cardinality must stay editable on its other fields, and a tags-bearing
  // PATCH is exactly the edit that can repair it.
  if (input.tags !== undefined) assertTagsWithinFacetCardinality(input.tags);
  // Judged on the row the PATCH leaves behind, so retyping a fee to `purchase`
  // while its `fee:` tags stay stored is refused too. A PATCH touching neither
  // field is not judged, for the same stays-editable reason as above.
  if (input.type !== undefined || input.tags !== undefined) {
    assertNoFeeTagsOnNonFeeType(type, input.tags ?? parseStoredTags(stored.tags));
  }
}
