import { getPillar } from '../pillar-client.js';

import type { PillarHandle } from '@pops/pillar-sdk/client';

export type TransactionListInput = {
  search?: string;
  startDate?: string;
  endDate?: string;
  entityId?: string;
  account?: string;
  type?: 'income' | 'expense' | 'transfer';
  limit?: number;
  offset?: number;
};

export type BudgetListInput = {
  search?: string;
  period?: 'monthly' | 'yearly';
  active?: 'true' | 'false';
  limit?: number;
  offset?: number;
};

export const MATCH_TYPES = ['exact', 'contains', 'regex'] as const;
export type MatchType = (typeof MATCH_TYPES)[number];

export type CorrectionListInput = {
  minConfidence?: number;
  matchType?: MatchType;
  limit?: number;
  offset?: number;
};

export type WishlistListInput = {
  search?: string;
  priority?: string;
  limit?: number;
  offset?: number;
};

export type StructuredFilter = { field: string; operator: string; value: string };

export type FinanceSearchInput = {
  query: { text: string; filters?: StructuredFilter[] };
};

export type FinancePillarShape = {
  transactions: {
    list: (input: TransactionListInput) => unknown;
    get: (input: { id: string }) => unknown;
  };
  budgets: {
    list: (input: BudgetListInput) => unknown;
    get: (input: { id: string }) => unknown;
  };
  corrections: {
    list: (input: CorrectionListInput) => unknown;
  };
  tagRules: {
    vocabulary: () => unknown;
  };
  wishlist: {
    list: (input: WishlistListInput) => unknown;
    get: (input: { id: string }) => unknown;
  };
  imports: {
    getImportProgress: (input: { sessionId: string }) => unknown;
  };
  search: {
    search: (input: FinanceSearchInput) => unknown;
  };
};

export function finance(): PillarHandle<FinancePillarShape> {
  return getPillar<FinancePillarShape>('finance');
}

export const ENTITY_TYPES = [
  'company',
  'person',
  'government',
  'bank',
  'place',
  'brand',
  'organisation',
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export type ContactsEntityListInput = {
  search?: string;
  type?: EntityType;
  limit?: number;
  offset?: number;
};

// Entities live on the CONTACTS pillar — the authoritative entity store
// (pillars/contacts/docs/prds/entities). The finance↔transactions usage rollup
// is finance's, but the entity table itself is contacts'. Reached over the same
// REST pillar SDK as the finance calls above.
export type ContactsShape = {
  entities: {
    list: (input: ContactsEntityListInput) => unknown;
  };
};

export function contacts(): PillarHandle<ContactsShape> {
  return getPillar<ContactsShape>('contacts');
}
