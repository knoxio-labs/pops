import type { PurchaseRow } from '../schema.js';
/**
 * Shared state for the ingest write path.
 *
 * The insert helpers take this rather than threading six positional
 * arguments each, so adding a table to the order graph does not mean
 * changing every signature.
 */
import type { PurchasesDb } from './internal.js';

/** Everything the per-table insert helpers need, assembled once. */
export interface IngestContext {
  readonly tx: PurchasesDb;
  readonly purchase: PurchaseRow;
  /** Adapter-local shipment ref → persisted id. */
  readonly shipmentIds: Map<string, string>;
  /** Adapter-local item ref → persisted id. */
  readonly itemIds: Map<string, string>;
  readonly now: string;
}

/** Resolve an adapter-local shipment ref, tolerating null and unknown refs. */
export function shipmentIdFor(ctx: IngestContext, ref: string | null | undefined): string | null {
  if (ref == null) return null;
  return ctx.shipmentIds.get(ref) ?? null;
}
