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
 *     │    ├─ purchase_charge_reviews   last sweep's review reason/candidates
 *     │    ├─ purchase_link_rejections  pairings a human ruled out
 *     │    └─ purchase_item_allocations which charge paid for which line
 *     ├─ purchase_documents             evidence → documents
 *     └─ purchase_capture               when and where it was photographed
 *
 * Two tables sit outside that tree because they are not facts about one
 * order: `purchase_products` and `purchase_product_aliases`, the learned
 * dictionary that gives a printed line a durable product identity for the
 * sources that state no sku.
 * `receipt_external_references` is outside it for a different reason: it
 * pins a stored receipt file for an owner on another pillar.
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

import type { purchaseCapture as purchaseCaptureTable } from './schema/capture.js';
import type {
  purchaseCharges as purchaseChargesTable,
  purchaseChargeReviews as purchaseChargeReviewsTable,
  purchaseChargeLinks as purchaseChargeLinksTable,
  purchaseItemAllocations as purchaseItemAllocationsTable,
  purchaseLinkRejections as purchaseLinkRejectionsTable,
} from './schema/charges.js';
import type { purchaseDocuments as purchaseDocumentsTable } from './schema/documents.js';
import type { purchaseEdits as purchaseEditsTable } from './schema/edits.js';
import type {
  purchaseItemNotes as purchaseItemNotesTable,
  purchaseItems as purchaseItemsTable,
  purchaseItemTags as purchaseItemTagsTable,
  purchaseItemUnits as purchaseItemUnitsTable,
} from './schema/items.js';
import type { pendingReceiptCaptures as pendingReceiptCapturesTable } from './schema/pending-receipt-captures.js';
import type {
  purchaseProductAliases as purchaseProductAliasesTable,
  purchaseProducts as purchaseProductsTable,
} from './schema/products.js';
import type {
  purchases as purchasesTable,
  purchaseShipments as purchaseShipmentsTable,
  purchaseTags as purchaseTagsTable,
} from './schema/purchases.js';
import type { receiptExternalReferences as receiptExternalReferencesTable } from './schema/receipt-external-references.js';
import type { purchaseMatchRules as purchaseMatchRulesTable } from './schema/rules.js';
import type {
  purchaseItemSharedTags as purchaseItemSharedTagsTable,
  sharedTagCache as sharedTagCacheTable,
} from './schema/shared-tags.js';
import type { purchaseSources as purchaseSourcesTable } from './schema/sources.js';

export {
  purchaseChargeLinks,
  purchaseCharges,
  purchaseChargeReviews,
  purchaseItemAllocations,
  purchaseLinkRejections,
} from './schema/charges.js';
export { purchaseCapture } from './schema/capture.js';
export { purchaseDocuments } from './schema/documents.js';
export { purchaseEdits } from './schema/edits.js';
export {
  purchaseItemNotes,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
} from './schema/items.js';
export { purchaseItemSharedTags, sharedTagCache } from './schema/shared-tags.js';
export { purchaseProductAliases, purchaseProducts } from './schema/products.js';
export { purchases, purchaseShipments, purchaseTags } from './schema/purchases.js';
export { receiptExternalReferences } from './schema/receipt-external-references.js';
export { pendingReceiptCaptures } from './schema/pending-receipt-captures.js';
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
export type PurchaseItemSharedTagRow = InferSelectModel<typeof purchaseItemSharedTagsTable>;
export type PurchaseItemSharedTagInsert = InferInsertModel<typeof purchaseItemSharedTagsTable>;
export type SharedTagCacheRow = InferSelectModel<typeof sharedTagCacheTable>;
export type SharedTagCacheInsert = InferInsertModel<typeof sharedTagCacheTable>;
export type PurchaseItemNoteRow = InferSelectModel<typeof purchaseItemNotesTable>;
export type PurchaseTagRow = InferSelectModel<typeof purchaseTagsTable>;
export type PurchaseChargeRow = InferSelectModel<typeof purchaseChargesTable>;
export type PurchaseChargeInsert = InferInsertModel<typeof purchaseChargesTable>;
export type PurchaseChargeReviewRow = InferSelectModel<typeof purchaseChargeReviewsTable>;
export type PurchaseChargeReviewInsert = InferInsertModel<typeof purchaseChargeReviewsTable>;
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
export type PurchaseEditRow = InferSelectModel<typeof purchaseEditsTable>;
export type PurchaseEditInsert = InferInsertModel<typeof purchaseEditsTable>;
export type PurchaseCaptureRow = InferSelectModel<typeof purchaseCaptureTable>;
export type PurchaseCaptureInsert = InferInsertModel<typeof purchaseCaptureTable>;
export type PurchaseSourceRow = InferSelectModel<typeof purchaseSourcesTable>;
export type PurchaseSourceInsert = InferInsertModel<typeof purchaseSourcesTable>;
export type PurchaseProductRow = InferSelectModel<typeof purchaseProductsTable>;
export type PurchaseProductInsert = InferInsertModel<typeof purchaseProductsTable>;
export type PurchaseProductAliasRow = InferSelectModel<typeof purchaseProductAliasesTable>;
export type PurchaseProductAliasInsert = InferInsertModel<typeof purchaseProductAliasesTable>;
export type ReceiptExternalReferenceRow = InferSelectModel<typeof receiptExternalReferencesTable>;
export type ReceiptExternalReferenceInsert = InferInsertModel<
  typeof receiptExternalReferencesTable
>;
export type PendingReceiptCaptureRow = InferSelectModel<typeof pendingReceiptCapturesTable>;
export type PendingReceiptCaptureInsert = InferInsertModel<typeof pendingReceiptCapturesTable>;
