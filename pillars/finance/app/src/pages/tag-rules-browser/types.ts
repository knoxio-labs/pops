export type MatchType = 'exact' | 'contains' | 'regex';

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
}
