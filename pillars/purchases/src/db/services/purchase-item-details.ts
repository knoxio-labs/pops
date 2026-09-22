/**
 * `selectItemDetails` — a purchase's lines, with tags, notes and units
 * attached.
 *
 * Split from `purchase-reads.ts` to keep that file under the line-count
 * cap; there is no behavioural reason for the boundary to sit here rather
 * than anywhere else in that read path.
 */
import { asc, eq, inArray } from 'drizzle-orm';

import {
  purchaseItemNotes,
  purchaseItems,
  purchaseItemTags,
  purchaseItemUnits,
} from '../schema.js';
import { landedCostCents } from './accounting.js';
import { groupBy } from './group-by.js';
import { type PurchasesDb } from './internal.js';

import type { PurchaseItemRow, PurchaseItemUnitRow } from '../schema.js';

/**
 * An item tag as a reader must receive it: never the slug on its own.
 *
 * `confirmedAt === null` is a classification pass's proposal; non-null is
 * an assertion. A list of lines "tagged `snack`" that silently mixes the
 * two is exactly the counterfactual a consumer must not compute.
 */
export interface ItemTagReading {
  readonly tag: string;
  readonly confirmedAt: string | null;
}

/** A line with everything hanging off it, plus its derived landed cost. */
export interface PurchaseItemDetail {
  readonly item: PurchaseItemRow;
  /** POPS classification. Empty is the normal state — no source states one. */
  readonly tags: readonly ItemTagReading[];
  /** Verbatim merchant prose, in printed order. */
  readonly notes: readonly string[];
  readonly units: readonly PurchaseItemUnitRow[];
  /** `lineTotal + allocatedShipping + allocatedAdjustment`. */
  readonly landedCostCents: number;
}

export function selectItemDetails(
  db: PurchasesDb,
  purchaseId: string
): readonly PurchaseItemDetail[] {
  const rows = db
    .select()
    .from(purchaseItems)
    .where(eq(purchaseItems.purchaseId, purchaseId))
    .orderBy(asc(purchaseItems.position), asc(purchaseItems.id))
    .all();
  if (rows.length === 0) return [];

  const ids = rows.map((row) => row.id);
  const tagRows = db
    .select()
    .from(purchaseItemTags)
    .where(inArray(purchaseItemTags.itemId, ids))
    .orderBy(asc(purchaseItemTags.tag))
    .all();
  // By position, not by insertion order: the position IS the ordering, and
  // it is the reason notes are not tag rows.
  const noteRows = db
    .select()
    .from(purchaseItemNotes)
    .where(inArray(purchaseItemNotes.itemId, ids))
    .orderBy(asc(purchaseItemNotes.position))
    .all();
  const unitRows = db
    .select()
    .from(purchaseItemUnits)
    .where(inArray(purchaseItemUnits.itemId, ids))
    .orderBy(asc(purchaseItemUnits.createdAt), asc(purchaseItemUnits.id))
    .all();

  const tagsByItem = groupBy(tagRows, (row) => row.itemId);
  const notesByItem = groupBy(noteRows, (row) => row.itemId);
  const unitsByItem = groupBy(unitRows, (row) => row.itemId);

  return rows.map((item) => ({
    item,
    tags: (tagsByItem.get(item.id) ?? []).map((row) => ({
      tag: row.tag,
      confirmedAt: row.confirmedAt,
    })),
    notes: (notesByItem.get(item.id) ?? []).map((row) => row.note),
    units: unitsByItem.get(item.id) ?? [],
    landedCostCents: landedCostCents(item),
  }));
}
