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
  productIdentityOf,
  type StoredProductIdentity,
} from './services/stored-product-identity.js';

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

export { type MerchantIdentity } from './services/merchant-identity.js';

export { listInventoryProposals, type InventoryProposal } from './services/inventory-proposals.js';

export {
  decideInventoryProposal,
  type InventoryProposalDecision,
} from './services/inventory-proposal-decisions.js';

export {
  rollUpMerchantSpend,
  type CurrencySpend,
  type MerchantSpend,
  type MerchantSpendRollup,
} from './services/merchant-spend.js';

export {
  identifyProduct,
  normalisedName,
  productLookupKey,
  productScopeKey,
  type ProductDictionary,
  type ProductDictionaryEntry,
  type ProductIdentity,
  type ProductLine,
} from './services/product-identity.js';

export {
  getProduct,
  listProducts,
  loadProductDictionary,
  type ListProductsFilter,
  type ProductWithAliases,
} from './services/product-dictionary.js';

export { proposeProducts, type ProposalOutcome } from './services/product-dictionary-proposals.js';

export {
  deleteAlias,
  deleteProduct,
  renameProduct,
  updateAlias,
  type UpdateAliasInput,
} from './services/product-dictionary-writes.js';

export {
  rankProductPurchases,
  type ProductCadence,
  type ProductIdentityCoverage,
  type ProductLeaderboard,
  type ProductLeaderboardFilter,
  type ProductPurchases,
  type ProductUnitPrice,
} from './services/product-leaderboard.js';

export {
  searchPurchases,
  type PurchaseSearchHit,
  type SearchMatchType,
} from './services/search.js';

export {
  searchFilterScope,
  type SearchFilter,
  type SearchScopeResult,
} from './services/search-filters.js';

export { type PurchaseChargeDetail } from './services/purchase-read-charges.js';

export {
  findPurchaseByChecksum,
  findPurchaseAtInstantForAmount,
  findPurchaseBySourceOrderId,
} from './services/purchase-lookups.js';

export { attachDocument, type AttachDocumentInput } from './services/purchase-documents.js';

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
  listPurchasesForTransaction,
  type LinkedCharge,
  type LinkedPurchase,
} from './services/reconcile-links.js';

export {
  summariseLinksForTransactions,
  type TransactionLinkSummary,
} from './services/reconcile-links-batch.js';

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

export {
  listActiveMatchRules,
  recordMatchRule,
  type MatchRuleEvidence,
} from './services/match-rules.js';

export {
  clearDocumentUriStale,
  clearInventoryItemUriStale,
  listDistinctDocumentUris,
  listDistinctInventoryItemUris,
  markDocumentUriStale,
  markInventoryItemUriStale,
} from './services/cross-pillar.js';

export { openPurchasesDb, type OpenedPurchasesDb } from './open-purchases-db.js';
