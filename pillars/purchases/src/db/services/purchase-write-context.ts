/**
 * Shared state for the ingest write path.
 *
 * The insert helpers take this rather than threading six positional
 * arguments each, so adding a table to the order graph does not mean
 * changing every signature.
 */
import { InvalidIngestPayloadError } from '../errors.js';

import type { PurchaseRow } from '../schema.js';
import type { PurchasesDb } from './internal.js';

/** Everything the per-table insert helpers need, assembled once. */
export interface IngestContext {
  readonly tx: PurchasesDb;
  readonly purchase: PurchaseRow;
  /** Adapter-local shipment ref → persisted id. */
  readonly shipmentIds: Map<string, string>;
  /**
   * Merchant shipment identifiers already claimed in this payload.
   *
   * Separate from {@link shipmentIds} since the two were split: a payload
   * can name the same delivery twice under two different wiring handles,
   * and only this catches it.
   */
  readonly shipmentSourceRefs: Set<string>;
  /** Adapter-local item ref → persisted id. */
  readonly itemIds: Map<string, string>;
  readonly now: string;
}

/**
 * Resolve an adapter-local shipment ref to the delivery it names.
 *
 * `null`/`undefined` means "no delivery", which is legitimate and common —
 * a digital line is never shipped, and a charge often cannot be attributed
 * to one box.
 *
 * A ref that names a delivery the payload never declared is a different
 * thing entirely, and is rejected. Resolving it to `null` would silently
 * demote a typo'd `shipmentRef` into an unassigned line: the order would
 * still balance, the line would still exist, and the delivery association
 * would just be gone, with nothing downstream able to tell that from a line
 * that genuinely has no delivery.
 */
export function shipmentIdFor(ctx: IngestContext, ref: string | null | undefined): string | null {
  if (ref == null) return null;
  const id = ctx.shipmentIds.get(ref);
  if (id === undefined) {
    throw new InvalidIngestPayloadError(`unknown shipment ref '${ref}'`);
  }
  return id;
}
