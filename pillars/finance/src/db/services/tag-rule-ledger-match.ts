/**
 * Whether a stored tag rule's pattern matches anything in the ledger — the
 * server-side half of POPS-2941: the Tag Rules browser marks a rule that can
 * never fire, distinct from one that has simply not been applied yet.
 * `times_applied = 0` cannot make that distinction (a brand-new correct rule
 * and a permanently dead one both read as 0); this runs the real predicate.
 *
 * Computed with {@link patternMatchesDescription}, never a reimplementation,
 * so this and the matcher cannot disagree — the same requirement
 * `previewRuleMatchTransactions` documents for POPS-2696: a partial window
 * (the browser's fetched page, an import batch) silently under-reports, so
 * this always scans the whole `transactions` table.
 *
 * Cost is bounded deliberately: {@link loadTagRuleLedgerSnapshot} issues one
 * `transactions` fetch (projected to just `description`/`entity_id`, not
 * every column `previewRuleMatchTransactions` needs for its impact panel),
 * and {@link tagRuleLedgerMatchStatus} tests each rule against that snapshot
 * with an early-exiting `.some()` rather than a full `.filter()` — it only
 * needs to know "does anything match", not the count. A caller loads the
 * snapshot once per page of rules (the Tag Rules browser's `list`/`get`
 * handlers do exactly this) and reuses it across every rule on that page:
 * the cost is one table scan per page load, not one per rule per render.
 */
import { transactions } from '../schema.js';
import { describeForMatching, patternMatchesDescription } from './transaction-corrections-types.js';

import type { FinanceDb } from './internal.js';
import type { MatchableDescription } from './transaction-corrections-types.js';
import type { TagRuleMatchType } from './transaction-tag-rules-types.js';

/**
 * A rule's relationship to the current ledger:
 *
 * - `'matched'` — its pattern matches at least one transaction.
 * - `'unused'` — it matches none, but that has a benign explanation: it is
 *   scoped to an entity with no transactions in the ledger at all (a
 *   legitimate rule written ahead of that merchant's first import), or the
 *   ledger itself is empty. Not broken — just not applicable yet.
 * - `'broken'` — it matches none, and there is no such explanation: an
 *   unscoped rule against a non-empty ledger with nothing for it, or an
 *   entity-scoped rule whose own entity has transactions and none of them
 *   match. This is the POPS-2758 failure shape.
 */
export type TagRuleLedgerMatchStatus = 'matched' | 'unused' | 'broken';

interface LedgerSnapshotRow {
  description: MatchableDescription;
  entityId: string | null;
}

/** The ledger data {@link tagRuleLedgerMatchStatus} tests rules against. */
export interface TagRuleLedgerSnapshot {
  readonly rows: readonly LedgerSnapshotRow[];
}

/** Fetch the snapshot every rule on a page is tested against, once. */
export function loadTagRuleLedgerSnapshot(db: FinanceDb): TagRuleLedgerSnapshot {
  const rows = db
    .select({ description: transactions.description, entityId: transactions.entityId })
    .from(transactions)
    .all();
  return {
    rows: rows.map((row) => ({
      description: describeForMatching(row.description),
      entityId: row.entityId,
    })),
  };
}

/** The minimal rule shape {@link tagRuleLedgerMatchStatus} needs. */
export interface TagRuleForLedgerMatch {
  descriptionPattern: string;
  matchType: TagRuleMatchType;
  entityId: string | null;
}

/** Classify `rule` against `snapshot` — see {@link TagRuleLedgerMatchStatus}. */
export function tagRuleLedgerMatchStatus(
  rule: TagRuleForLedgerMatch,
  snapshot: TagRuleLedgerSnapshot
): TagRuleLedgerMatchStatus {
  const matches = snapshot.rows.some((row) =>
    patternMatchesDescription(rule.descriptionPattern, rule.matchType, row.description)
  );
  if (matches) return 'matched';

  const entityHasLedgerTransactions =
    rule.entityId === null
      ? snapshot.rows.length > 0
      : snapshot.rows.some((row) => row.entityId === rule.entityId);

  return entityHasLedgerTransactions ? 'broken' : 'unused';
}
