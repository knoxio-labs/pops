export type MatchType = 'exact' | 'contains' | 'regex';

/**
 * A rule's relationship to the current ledger (POPS-2941): `matched` has
 * fired or would fire, `unused` matches nothing but has a benign explanation
 * (its entity has no transactions yet, or the ledger is empty), `broken`
 * matches nothing with no such explanation — the POPS-2758 failure shape the
 * browser should surface.
 */
export type LedgerMatchStatus = 'matched' | 'unused' | 'broken';

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
}
