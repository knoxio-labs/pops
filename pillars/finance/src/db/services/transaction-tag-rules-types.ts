/**
 * The tag-rule shapes both the read and the write half of this service need.
 *
 * They live apart from `transaction-tag-rules.ts` because that module imports
 * the write half for its own re-exports, and the write half needs these types
 * — a cycle the module-boundaries gate rejects. A leaf module holding only
 * types is the seam that removes it: both halves depend on this, and it
 * depends on neither.
 */
import type { transactionTagRules } from '../schema.js';

/** Raw drizzle row shape. */
export type TransactionTagRuleRow = typeof transactionTagRules.$inferSelect;

/** Match strategy for the rule's description pattern. */
export type TagRuleMatchType = 'exact' | 'contains' | 'regex';

/** Mutable subset accepted on create. `tags` is the parsed `string[]` form. */
export interface CreateTransactionTagRuleInput {
  descriptionPattern: string;
  matchType: TagRuleMatchType;
  entityId?: string | null;
  tags: string[];
  confidence?: number;
  isActive?: boolean;
  priority?: number;
}
