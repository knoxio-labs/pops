/**
 * What one correction rule would change about one already-stored transaction.
 *
 * Split out of `reclassify-existing.ts` (POPS-3068), which had grown to within
 * six lines of the 200-line cap with two concurrent branches editing the import
 * write path. The seam is the one the file already had: everything here is a
 * pure function of a row and a rule, answering "what would change", with no
 * database access and no notion of batches or passes. `reclassify-existing.ts`
 * keeps the two passes that fetch rows, drive these builders and write the
 * result.
 *
 * That division is worth preserving rather than re-flattening: the whole-rule-set
 * catch-up and the single-rule explicit apply must agree on what a rule does to
 * a row, and they agree because they call the same builder. Inlining any of this
 * back into either pass is how they start to drift.
 */
import { isPositiveAmountPurchase } from '../../../contract/corrections-constants.js';
import {
  type CorrectionRow,
  normalizeEntityId,
  parseCorrectionTags,
} from '../corrections/index.js';

/** The columns both retroactive passes select, and all these builders may read. */
export interface BatchTxn {
  id: string;
  description: string;
  accountId: string;
  /** Selected only so {@link changedType} can refuse an incoherent retype (POPS-2685). */
  amountCents: number;
  entityId: string | null;
  type: string;
  location: string | null;
  tags: string;
  matchType: string | null;
}

/**
 * The entity a rule would newly assign, or `null` when it must be left alone.
 *
 * Only rules that carry an entity of their own can change one, and only when it
 * differs — so an entity-less transfer/income rule can never null out a
 * transaction's correctly-assigned merchant (the CF006 regression).
 */
function providedEntityChange(
  txn: BatchTxn,
  rule: CorrectionRow
): { entityId: string; entityName: string | null } | null {
  const ruleEntityId = normalizeEntityId(rule.entityId);
  if (ruleEntityId === null || ruleEntityId === (txn.entityId ?? null)) return null;
  return { entityId: ruleEntityId, entityName: rule.entityName ?? null };
}

/** The lowercase canonical `type` the rule would newly assign (written verbatim
 * to `transactions.type` since #3607 stage 2 — no more capitalized collapse), or
 * `null` when the rule carries no type, it already matches, or applying it
 * would contradict the row's amount.
 *
 * That last case is the retroactive half of POPS-2685. A rule saying
 * `purchase` is written against a descriptor, not against a sign, so replaying
 * it across the ledger will eventually land on a credit — which is how
 * POPS-2680's `learned` rows were produced. Only the type is dropped, not the
 * whole rule: the entity, location and tags it carries are still right for the
 * row, and refusing all of them would leave the merchant unresolved to protect
 * a field that simply does not apply. This path cannot throw the way the
 * single-row writers do — one bad row must not abort a catch-up pass over the
 * whole ledger. */
function changedType(txn: BatchTxn, rule: CorrectionRow): string | null {
  const newType = rule.transactionType;
  if (newType == null || newType === txn.type) return null;
  if (isPositiveAmountPurchase(txn.amountCents, newType)) return null;
  return newType;
}

function changedLocation(txn: BatchTxn, rule: CorrectionRow): string | null {
  const newLocation = rule.location ?? null;
  return newLocation !== null && newLocation !== (txn.location ?? null) ? newLocation : null;
}

/**
 * Tags the rule would add to the transaction (additive-only, never removes an
 * existing tag), or `null` when the rule carries no tags or the transaction
 * already has every one of them.
 */
function mergedTags(txn: BatchTxn, rule: CorrectionRow): string[] | null {
  const ruleTags = parseCorrectionTags(rule.tags);
  if (ruleTags.length === 0) return null;
  const existing = parseCorrectionTags(txn.tags);
  const missing = ruleTags.filter((t) => !existing.includes(t));
  return missing.length > 0 ? [...existing, ...missing] : null;
}

/** Entity/type/location changes a rule makes, shared by every retroactive builder. */
function buildCoreFieldUpdates(txn: BatchTxn, rule: CorrectionRow): Record<string, unknown> {
  const updates: Record<string, unknown> = {};

  const entity = providedEntityChange(txn, rule);
  if (entity) {
    updates.entityId = entity.entityId;
    updates.entityName = entity.entityName;
  }

  const newType = changedType(txn, rule);
  if (newType !== null) updates.type = newType;

  const newLocation = changedLocation(txn, rule);
  if (newLocation !== null) updates.location = newLocation;

  return updates;
}

/**
 * Build the DB update for a matched rule, or `null` when nothing changed.
 * Never clears an existing entity — see {@link providedEntityChange}. Extends
 * {@link buildCoreFieldUpdates} with tag-merge (additive-only) and
 * match-provenance stamping, shared by both the always-on catch-up
 * (`reclassifyExistingTransactions`) and the single-rule explicit apply
 * (`applyCorrectionRuleToExistingTransactions`).
 */
export function buildRetroactiveApplyUpdates(
  txn: BatchTxn,
  rule: CorrectionRow
): Record<string, unknown> | null {
  const updates = buildCoreFieldUpdates(txn, rule);

  const newTags = mergedTags(txn, rule);
  if (newTags !== null) updates.tags = JSON.stringify(newTags);

  if (Object.keys(updates).length === 0) return null;

  updates.matchType = 'learned';
  updates.matchRuleId = rule.id;
  updates.matchConfidence = rule.confidence;
  updates.lastEditedTime = new Date().toISOString();
  return updates;
}
