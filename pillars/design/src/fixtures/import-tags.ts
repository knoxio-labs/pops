import { byBucket, type ImportTxn } from './import-txns';

/** Fictional tag-suggestion data for the import wizard's Tags step. */
export interface TagSuggestion {
  tag: string;
  source: 'ai' | 'rule' | 'entity';
}

export interface ConfirmedTxn extends ImportTxn {
  tags: string[];
  suggestedTags: TagSuggestion[];
}

export interface EntityTagGroup {
  entityName: string;
  transactions: ConfirmedTxn[];
}

const SUGGESTIONS: Record<string, TagSuggestion[]> = {
  a1b2c3: [{ tag: 'groceries', source: 'rule' }],
  d4e5f6: [{ tag: 'transport', source: 'entity' }],
  g7h8i9: [{ tag: 'salary', source: 'entity' }],
  j1k2l3: [{ tag: 'utilities', source: 'rule' }],
  m4n5o6: [{ tag: 'household', source: 'entity' }],
  s1t2u3: [{ tag: 'dining', source: 'ai' }],
  v4w5x6: [{ tag: 'household', source: 'ai' }],
};

/** Confirmed transactions — the matched bucket, tags pre-filled, ready for Tag Review. */
export const confirmedTxns: ConfirmedTxn[] = byBucket('matched').map((t) => ({
  ...t,
  tags: [],
  suggestedTags: SUGGESTIONS[t.checksum] ?? [],
}));

export function tagGroupsFrom(rows: ConfirmedTxn[]): EntityTagGroup[] {
  const byEntity = new Map<string, ConfirmedTxn[]>();
  for (const row of rows) {
    const name = row.entity?.name ?? 'No entity';
    byEntity.set(name, [...(byEntity.get(name) ?? []), row]);
  }
  return [...byEntity.entries()].map(([entityName, transactions]) => ({
    entityName,
    transactions,
  }));
}
