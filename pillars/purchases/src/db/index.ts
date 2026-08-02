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
  setPurchaseStatus,
  type ListPurchasesFilter,
  type PurchaseChargeDetail,
  type PurchaseDetail,
  type PurchaseItemDetail,
} from './services/purchase-reads.js';

export {
  findPurchaseByChecksum,
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

export { openPurchasesDb, type OpenedPurchasesDb } from './open-purchases-db.js';
