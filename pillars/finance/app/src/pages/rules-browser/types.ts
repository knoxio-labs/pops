import type { TransactionType } from '../../lib/transaction-type';

export type MatchType = 'exact' | 'contains' | 'regex';

export interface Correction {
  id: string;
  descriptionPattern: string;
  /** Optional account scope — `null` means the rule matches on every account. */
  accountId: string | null;
  matchType: MatchType;
  entityId: string | null;
  entityName: string | null;
  location: string | null;
  tags: string[];
  transactionType: TransactionType | null;
  isActive: boolean;
  priority: number;
  confidence: number;
  timesApplied: number;
  createdAt: string;
  lastUsedAt: string | null;
}
