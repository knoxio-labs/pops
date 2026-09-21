/**
 * Item-tag reads for `search.ts`'s two adapters.
 *
 * Split out of `search.ts` rather than inlined: an item tag lives on
 * `purchase_item_tags`, a table neither adapter's own scan touches
 * otherwise, so both the free-text tag match and the `tags` filter narrowing
 * are one join away from the row types `search.ts` already scans.
 */
import { eq, inArray, sql } from 'drizzle-orm';

import { purchaseItems, purchaseItemTags } from '../schema.js';
import { containsInsensitive } from './search-text.js';

import type { PurchasesDb } from './internal.js';

/**
 * One matching tag per item whose tag contains `text`, keyed by item id.
 *
 * `MIN(tag)` rather than every matching tag: a hit carries one `matchField`
 * value, and a line with two matching tags is still one hit at its best
 * match, exactly as `bestMatch` already treats a line matching on both
 * `name` and `sku`. Grouped here rather than joined onto `itemRows`'s own
 * scan, which would fan out one row per tag and duplicate the hit.
 */
export function matchingTagByItem(db: PurchasesDb, text: string): Map<string, string> {
  const rows = db
    .select({ itemId: purchaseItemTags.itemId, tag: sql<string>`min(${purchaseItemTags.tag})` })
    .from(purchaseItemTags)
    .where(containsInsensitive(purchaseItemTags.tag, text))
    .groupBy(purchaseItemTags.itemId)
    .all();
  return new Map(rows.map((row) => [row.itemId, row.tag]));
}

/** The items a `tags` filter admits: any line carrying one of the chosen tags. */
export function itemIdsWithTags(db: PurchasesDb, tags: readonly string[]): Set<string> {
  const rows = db
    .select({ itemId: purchaseItemTags.itemId })
    .from(purchaseItemTags)
    .where(inArray(purchaseItemTags.tag, [...tags]))
    .all();
  return new Set(rows.map((row) => row.itemId));
}

/**
 * The orders a `tags` filter admits: any order holding a line carrying one
 * of the chosen tags — never an order's own top-level tag, which is a
 * different table and not what this filter means.
 */
export function purchaseIdsWithTaggedItems(db: PurchasesDb, tags: readonly string[]): Set<string> {
  const rows = db
    .select({ purchaseId: purchaseItems.purchaseId })
    .from(purchaseItems)
    .innerJoin(purchaseItemTags, eq(purchaseItemTags.itemId, purchaseItems.id))
    .where(inArray(purchaseItemTags.tag, [...tags]))
    .all();
  return new Set(rows.map((row) => row.purchaseId));
}
