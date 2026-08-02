/**
 * Purchases domain table barrel.
 *
 * Canonical definitions for purchases-owned tables live in this pillar; no
 * other pillar defines or migrates them (ADR-042).
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  purchaseMatchRules as purchaseMatchRulesTable,
  purchaseTransactionLinks as purchaseTransactionLinksTable,
} from './schema/links.js';
import type {
  purchaseItems as purchaseItemsTable,
  purchases as purchasesTable,
} from './schema/purchases.js';
import type { purchaseSources as purchaseSourcesTable } from './schema/sources.js';

export { purchaseMatchRules, purchaseTransactionLinks } from './schema/links.js';
export { purchaseItems, purchases } from './schema/purchases.js';
export { purchaseSources } from './schema/sources.js';

export type PurchaseRow = InferSelectModel<typeof purchasesTable>;
export type PurchaseInsert = InferInsertModel<typeof purchasesTable>;
export type PurchaseItemRow = InferSelectModel<typeof purchaseItemsTable>;
export type PurchaseItemInsert = InferInsertModel<typeof purchaseItemsTable>;
export type PurchaseTransactionLinkRow = InferSelectModel<typeof purchaseTransactionLinksTable>;
export type PurchaseTransactionLinkInsert = InferInsertModel<typeof purchaseTransactionLinksTable>;
export type PurchaseMatchRuleRow = InferSelectModel<typeof purchaseMatchRulesTable>;
export type PurchaseMatchRuleInsert = InferInsertModel<typeof purchaseMatchRulesTable>;
export type PurchaseSourceRow = InferSelectModel<typeof purchaseSourcesTable>;
export type PurchaseSourceInsert = InferInsertModel<typeof purchaseSourcesTable>;
