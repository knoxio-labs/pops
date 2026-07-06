/**
 * Inferred `Row`/`Insert` aliases for finance tables that don't have a
 * dedicated service. Service-owned types (`TransactionRow`,
 * `BudgetRow`, `WishListRow`, `TagVocabularyRow`,
 * `TransactionTagRuleRow`, `TransactionCorrectionRow`) live in their
 * respective service modules and are re-exported from `./index.ts`.
 *
 * Hosted here so all finance row shapes are re-exported from a single
 * `./index.ts` (the pillar-internal db barrel).
 */
import type { InferInsertModel } from 'drizzle-orm';

import type { budgets, transactionCorrections, transactions, wishList } from './schema.js';

export type TransactionInsert = InferInsertModel<typeof transactions>;
export type BudgetInsert = InferInsertModel<typeof budgets>;
export type WishListInsert = InferInsertModel<typeof wishList>;
export type TransactionCorrectionInsert = InferInsertModel<typeof transactionCorrections>;
