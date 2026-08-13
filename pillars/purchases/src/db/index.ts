/**
 * Internal barrel for the purchases pillar's persistence layer.
 *
 * PRIVATE to the pillar — never exported from `@pops/purchases`'s public
 * surface. The `api/` subdir imports services and types from here via
 * relative paths.
 */
export * from './errors.js';
export * from './schema.js';

export type { PurchasesDb } from './services/internal.js';

export {
  computeAccounting,
  landedCostCents,
  type PurchaseAccounting,
} from './services/accounting.js';

export {
  deletePurchase,
  getPurchase,
  listItemsByTag,
  listPurchases,
  selectItemDetails,
  setPurchaseStatus,
  type ItemTagReading,
  type ListPurchasesFilter,
  type PurchaseDetail,
  type PurchaseItemDetail,
  type PurchaseScopeFilter,
  type TaggedItem,
} from './services/purchase-reads.js';

export {
  confirmItemClassification,
  type ConfirmItemInput,
} from './services/purchase-item-mutations.js';

export {
  rollUpMerchantSpend,
  type CurrencySpend,
  type MerchantIdentity,
  type MerchantSpend,
  type MerchantSpendRollup,
} from './services/merchant-spend.js';

export {
  searchPurchases,
  type PurchaseSearchHit,
  type SearchMatchType,
} from './services/search.js';

export { type PurchaseChargeDetail } from './services/purchase-read-charges.js';

export {
  findPurchaseByChecksum,
  findPurchaseAtInstantForAmount,
  findPurchaseBySourceOrderId,
} from './services/purchase-lookups.js';

export {
  createPurchase,
  type CreateChargeAllocationInput,
  type CreateChargeInput,
  type CreateDocumentInput,
  type CreateItemInput,
  type CreateItemUnitInput,
  type CreatePurchaseInput,
  type CreateShipmentInput,
} from './services/purchase-writes.js';

export {
  deleteSource,
  getSource,
  listSources,
  upsertSource,
  type UpsertSourceInput,
} from './services/sources.js';

export {
  listConfirmedLinks,
  listOrdersNeedingDerivedCharge,
  listRejectedPairings,
  listSolvableCharges,
  type ReconcileScope,
} from './services/reconcile-reads.js';

export {
  listReconcileQueue,
  type QueueEntry,
  type QueueFilter,
  type QueuedLink,
} from './services/reconcile-queue.js';

export {
  chargeIdsForPurchases,
  confirmLink,
  rejectLink,
  unlinkCharge,
  mintDerivedCharge,
  persistProposedLinks,
  tearDownUnconfirmedLinks,
  type ConfirmOutcome,
} from './services/reconcile-writes.js';

export { recordMatchRule, type MatchRuleEvidence } from './services/match-rules.js';

export {
  clearDocumentUriStale,
  clearInventoryItemUriStale,
  listDistinctDocumentUris,
  listDistinctInventoryItemUris,
  markDocumentUriStale,
  markInventoryItemUriStale,
} from './services/cross-pillar.js';

export { openPurchasesDb, type OpenedPurchasesDb } from './open-purchases-db.js';
