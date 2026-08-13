/**
 * The writer for `purchase_match_rules` — how the matcher remembers a
 * decision.
 *
 * A rule is a descriptor pattern, not a pointer from an order to the
 * transaction that settled it. That distinction is the whole design: a
 * pointer would explain one link and expire with it, while a pattern says
 * something about which transactions belong to a merchant, which is the
 * only form of an answer that can still be useful for an order nobody has
 * imported yet.
 */
import { sql } from 'drizzle-orm';

import { matchPatternFor } from '../../contract/match-rules.js';
import { purchaseMatchRules } from '../schema.js';
import { expectRow, type PurchasesDb } from './internal.js';

/**
 * What a human decision knows about the merchant it was made for.
 *
 * `entityId` is operative and `entityName` is only its label — the same
 * invariant the order it came from carries. A rule keyed on the label would
 * merge two merchants that happen to share a string and split one that was
 * renamed.
 */
export interface MatchRuleEvidence {
  /** The transaction descriptor the decision was made about. */
  readonly transactionDescription: string | null;
  /** The order's source, which scopes the rule. Never null from a decision. */
  readonly source: string;
  readonly entityId: string | null;
  readonly entityName: string | null;
  readonly confidence: number;
}

/**
 * Record a decision as a rule, or say why there is nothing to record.
 *
 * Null means the descriptor carried no pattern worth keying on — see
 * {@link matchPatternFor}. It is not an error: the decision itself still
 * stands, and a caller that treated a missing rule as a failed confirm
 * would refuse a perfectly good pin over a merchant whose descriptor is
 * digits.
 *
 * Re-deciding the same merchant updates the existing row rather than
 * writing a second one saying the same thing. Three fields move on the way
 * through:
 *
 * - `timesApplied` counts the links attributed to this rule, so it stays
 *   equal to the number of `purchase_charge_links` rows carrying its id —
 *   an invariant a reader can check rather than a counter nobody can
 *   interpret. The caller is responsible for not calling twice for one
 *   link, which is why confirming an already-confirmed link is a no-op.
 * - `isActive` returns to true. Confirming a merchant whose rule was
 *   deactivated is an affirmation, and leaving it inert would discard the
 *   decision silently.
 * - `entityId` and `entityName` fill in but never blank out. Export ingest
 *   resolves no entity, so most orders carry a label alone; the day a
 *   receipt for the same merchant arrives with a resolved id the rule
 *   should gain it, and the day another label-only order arrives it must
 *   not lose it again.
 */
export function recordMatchRule(db: PurchasesDb, evidence: MatchRuleEvidence): string | null {
  const pattern = matchPatternFor(evidence.transactionDescription);
  if (pattern === null) return null;

  const rows = db
    .insert(purchaseMatchRules)
    .values({
      descriptionPattern: pattern,
      matchType: 'exact',
      entityId: evidence.entityId,
      entityName: evidence.entityName,
      source: evidence.source,
      isActive: true,
      confidence: evidence.confidence,
      timesApplied: 1,
      lastUsedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
    })
    .onConflictDoUpdate({
      target: [purchaseMatchRules.descriptionPattern, purchaseMatchRules.source],
      set: {
        entityId: sql`COALESCE(excluded.entity_id, ${purchaseMatchRules.entityId})`,
        entityName: sql`COALESCE(excluded.entity_name, ${purchaseMatchRules.entityName})`,
        isActive: true,
        timesApplied: sql`${purchaseMatchRules.timesApplied} + 1`,
        lastUsedAt: sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`,
      },
    })
    .returning({ id: purchaseMatchRules.id })
    .all();

  return expectRow(rows, 'recordMatchRule').id;
}
