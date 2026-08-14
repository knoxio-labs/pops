/**
 * Purchases domain table barrel.
 *
 * Canonical definitions for purchases-owned tables live in this pillar; no
 * other pillar defines or migrates them (ADR-042).
 *
 * The shape, in one place — an ORDER is the single point of entry, and
 * three flat lists hang off it:
 *
 *   purchases  (the order)
 *     ├─ purchase_shipments             every delivery
 *     ├─ purchase_items                 every line, complete
 *     │    ├─ purchase_item_units       per-unit identity → inventory
 *     │    ├─ purchase_item_tags        POPS classification, proposed or asserted
 *     │    └─ purchase_item_notes       verbatim merchant prose, ordered
 *     ├─ purchase_charges               every charge, matched or not
 *     │    ├─ purchase_charge_links     charge → finance transaction
 *     │    ├─ purchase_link_rejections  pairings a human ruled out
 *     │    └─ purchase_item_allocations which charge paid for which line
 *     └─ purchase_documents             evidence → documents
 *
 * Two properties of that shape are load-bearing:
 *
 * **A charge does not depend on finance.** It is recorded when the merchant
 * states it and links to a transaction only once one is imported, so the
 * weeks between "Amazon charged the card" and "the statement landed" are
 * represented rather than looking like an unexplained gap.
 *
 * **The cross-references BETWEEN the lists are all nullable** —
 * item→shipment, charge→shipment, charge→item. That is deliberate:
 * merchants group charges in ways that need not correspond to deliveries,
 * and the model must not demand an answer it does not have.
 */
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm';

import type {
  purchaseCharges as purchaseChargesTable,
  purchaseChargeLinks as purchaseChargeLinksTable,
  purchaseItemAllocations as purchaseItemAllocationsTable,
  purchaseLinkRejections as purchaseLinkRejectionsTable,
} from './schema/charges.js';
import type { purchaseDocuments as purchaseDocumentsTable } from './schema/documents.js';
import type {
  purchaseItemNotes as purchaseItemNotesTable,
  purchaseItems as purchaseItemsTable,
  purchaseItemTags as purchaseItemTagsTable,
  purchaseItemUnits as purchaseItemUnitsTable,
} from './schema/items.js';
import type {
  purchases as purchasesTable,
  purchaseShipments as purchaseShipmentsTable,
  purchaseTags as purchaseTagsTable,
} from './schema/purchases.js';
import type { purchaseMatchRules as purchaseMatchRulesTable } from './schema/rules.js';
import type { purchaseSources as purchaseSourcesTable } from './schema/sources.js';

export {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseItemAllocations,
  purchaseLinkRejections,
} from './schema/charges.js';
export { purchaseDocuments } from './schema/documents.js';
export {
  purchaseItemNotes,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
} from './schema/items.js';
export { purchases, purchaseShipments, purchaseTags } from './schema/purchases.js';
export { purchaseMatchRules } from './schema/rules.js';
export { purchaseSources } from './schema/sources.js';

export type PurchaseRow = InferSelectModel<typeof purchasesTable>;
export type PurchaseInsert = InferInsertModel<typeof purchasesTable>;
export type PurchaseShipmentRow = InferSelectModel<typeof purchaseShipmentsTable>;
export type PurchaseShipmentInsert = InferInsertModel<typeof purchaseShipmentsTable>;
export type PurchaseItemRow = InferSelectModel<typeof purchaseItemsTable>;
export type PurchaseItemInsert = InferInsertModel<typeof purchaseItemsTable>;
export type PurchaseItemUnitRow = InferSelectModel<typeof purchaseItemUnitsTable>;
export type PurchaseItemUnitInsert = InferInsertModel<typeof purchaseItemUnitsTable>;
export type PurchaseItemTagRow = InferSelectModel<typeof purchaseItemTagsTable>;
export type PurchaseItemNoteRow = InferSelectModel<typeof purchaseItemNotesTable>;
export type PurchaseTagRow = InferSelectModel<typeof purchaseTagsTable>;
export type PurchaseChargeRow = InferSelectModel<typeof purchaseChargesTable>;
export type PurchaseChargeInsert = InferInsertModel<typeof purchaseChargesTable>;
export type PurchaseChargeLinkRow = InferSelectModel<typeof purchaseChargeLinksTable>;
export type PurchaseChargeLinkInsert = InferInsertModel<typeof purchaseChargeLinksTable>;
export type PurchaseItemAllocationRow = InferSelectModel<typeof purchaseItemAllocationsTable>;
export type PurchaseItemAllocationInsert = InferInsertModel<typeof purchaseItemAllocationsTable>;
export type PurchaseLinkRejectionRow = InferSelectModel<typeof purchaseLinkRejectionsTable>;
export type PurchaseLinkRejectionInsert = InferInsertModel<typeof purchaseLinkRejectionsTable>;
export type PurchaseMatchRuleRow = InferSelectModel<typeof purchaseMatchRulesTable>;
export type PurchaseMatchRuleInsert = InferInsertModel<typeof purchaseMatchRulesTable>;
export type PurchaseDocumentRow = InferSelectModel<typeof purchaseDocumentsTable>;
export type PurchaseDocumentInsert = InferInsertModel<typeof purchaseDocumentsTable>;
export type PurchaseSourceRow = InferSelectModel<typeof purchaseSourcesTable>;
export type PurchaseSourceInsert = InferInsertModel<typeof purchaseSourcesTable>;
