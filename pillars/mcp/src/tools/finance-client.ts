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

/** Where a checkpoint's balance came from — mirrors `CHECKPOINT_SOURCES` in `checkpoint.ts`. */
export const CHECKPOINT_SOURCES = ['manual', 'import', 'statement'] as const;
export type CheckpointSource = (typeof CHECKPOINT_SOURCES)[number];

/**
 * An account's balance at a date, ledger-signed: positive is money held,
 * negative is money owed, for assets and liabilities alike. `basis:
 * 'transactions'` means no checkpoint exists yet and the figure is net flow
 * of whatever was imported, not a real balance. Mirrors `AccountBalanceSchema`
 * in `pillars/finance/src/contract/rest-checkpoints-schemas.ts`.
 */
export type AccountBalance = {
  balanceCents: number;
  asOf: string;
  basis: 'checkpoint' | 'transactions';
  anchor: { checkpointId: string; asOf: string; source: CheckpointSource } | null;
  inconsistent: boolean;
};

export type AccountListInput = {
  archived?: 'true' | 'false';
  limit?: number;
  offset?: number;
};

/**
 * The closed field vocabulary `POST /search` enforces, mirrored from
 * `SEARCH_FILTER_FIELDS` in `pillars/finance/src/contract/rest-search.ts` —
 * the finance pillar's real enforcement, which a filter naming any other
 * field is rejected against with a 400. Kept in step by
 * `finance-search.test.ts`, which diffs this array against the field
 * `enum` the finance pillar's committed OpenAPI spec advertises for the
 * same endpoint.
 */
export const SEARCH_FILTER_FIELDS = [
  'type',
  'entityId',
  'date',
  'period',
  'active',
  'priority',
] as const;
export type SearchFilterField = (typeof SEARCH_FILTER_FIELDS)[number];

/**
 * The closed operator vocabulary `POST /search` enforces, mirrored from
 * `SEARCH_FILTER_OPERATORS` in the same contract file. Kept in step by the
 * same drift test as `SEARCH_FILTER_FIELDS`.
 */
export const SEARCH_FILTER_OPERATORS = ['eq', 'gte', 'lte'] as const;
export type SearchFilterOperator = (typeof SEARCH_FILTER_OPERATORS)[number];

export type StructuredFilter = {
  field: SearchFilterField;
  operator: SearchFilterOperator;
  value: string;
};

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
  accounts: {
    list: (input: AccountListInput) => unknown;
  };
  checkpoints: {
    list: (input: { id: string }) => unknown;
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

// Entities live on the CONTACTS pillar — the authoritative entity store. The
// finance↔transactions usage rollup is finance's, but the entity table itself
// is contacts'. Reached over the same REST pillar SDK as the finance calls above.
export type ContactsShape = {
  entities: {
    list: (input: ContactsEntityListInput) => unknown;
  };
};

export function contacts(): PillarHandle<ContactsShape> {
  return getPillar<ContactsShape>('contacts');
}
