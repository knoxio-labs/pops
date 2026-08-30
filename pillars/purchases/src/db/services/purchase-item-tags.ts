/** Cross-order reads keyed on an item tag rather than an order. */
import { asc, count, desc, eq } from 'drizzle-orm';

import { purchaseItems, purchaseItemTags } from '../schema.js';
import { type PurchasesDb } from './internal.js';

import type { PurchaseItemRow } from '../schema.js';

/** A line that carries a given tag, with that tag's confirmation marker. */
export interface TaggedItem {
  readonly item: PurchaseItemRow;
  readonly confirmedAt: string | null;
}

/** A page of {@link listItemsByTag}, with the true count across every order. */
export interface TaggedItemPage {
  readonly rows: readonly TaggedItem[];
  readonly total: number;
}

/**
 * A page of lines carrying a given item tag, across every order, plus the
 * true total for the tag. The query exists over `purchase_item_tags` to
 * serve — a JSON array column would answer it only with a full scan.
 *
 * `total` is a separate `COUNT` over the same predicate rather than
 * `rows.length`, because a caller paging past the returned page — or asking
 * "how many" without ever fetching every row — needs the tag's true size,
 * not the size of one page of it.
 *
 * The tag's confirmation marker travels with each line rather than being
 * dropped. It cannot live on the line itself — the tag is on the join row —
 * and without it a caller summing "everything tagged `snack`" cannot tell
 * which of those labels a human ever agreed with.
 */
export function listItemsByTag(
  db: PurchasesDb,
  tag: string,
  limit = 200,
  offset = 0
): TaggedItemPage {
  const rows = db
    .select({ item: purchaseItems, confirmedAt: purchaseItemTags.confirmedAt })
    .from(purchaseItemTags)
    .innerJoin(purchaseItems, eq(purchaseItems.id, purchaseItemTags.itemId))
    .where(eq(purchaseItemTags.tag, tag))
    .orderBy(desc(purchaseItems.createdAt), asc(purchaseItems.position), asc(purchaseItems.id))
    .limit(limit)
    .offset(offset)
    .all();
  const totalRow = db
    .select({ total: count() })
    .from(purchaseItemTags)
    .where(eq(purchaseItemTags.tag, tag))
    .all()[0];

  return { rows, total: totalRow?.total ?? 0 };
}
