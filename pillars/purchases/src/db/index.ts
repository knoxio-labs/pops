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
  createPurchase,
  deletePurchase,
  findPurchaseByChecksum,
  getPurchase,
  listPurchases,
  setPurchaseStatus,
  type CreatePurchaseInput,
  type CreatePurchaseItemInput,
  type ListPurchasesFilter,
  type PurchaseDetail,
} from './services/purchases.js';

export {
  deleteSource,
  getSource,
  listSources,
  upsertSource,
  type UpsertSourceInput,
} from './services/sources.js';

export { openPurchasesDb, type OpenedPurchasesDb } from './open-purchases-db.js';
