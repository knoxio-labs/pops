export type MatchType = 'exact' | 'contains' | 'regex';

/**
 * A rule's relationship to the current ledger (POPS-2941): `matched` has
 * fired or would fire, `unused` matches nothing but has a benign explanation
 * (its entity has no transactions yet, or the ledger is empty), `broken`
 * matches nothing with no such explanation — the POPS-2758 failure shape the
 * browser should surface.
 */
export type LedgerMatchStatus = 'matched' | 'unused' | 'broken';

/**
 * Another active rule this one overlaps with in the ledger (POPS-3691):
 * `contradicts` when both match a transaction and write different values on a
 * single-valued axis, so one silently loses; `redundant` when the other matches
 * every transaction this one does and already writes all of its tags.
 */
export interface TagRuleOverlap {
  ruleId: string;
  descriptionPattern: string;
  kind: 'contradicts' | 'redundant';
}

export interface TagRule {
  id: string;
  descriptionPattern: string;
  matchType: MatchType;
  entityId: string | null;
  tags: string[];
  isActive: boolean;
  confidence: number;
  priority: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
  ledgerMatchStatus: LedgerMatchStatus;
  overlaps: TagRuleOverlap[];
}
