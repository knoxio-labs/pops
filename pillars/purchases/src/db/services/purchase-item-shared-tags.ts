/**
 * Purchases-owned reads and writes for shared tag assignments on line items.
 *
 * An explicit attach is stored as confirmed: this operation records a direct
 * assignment, not a classifier proposal or a vocabulary-cache refresh. That
 * follows the meaning of confirmedAt on purchases' product-grained tags.
 */
import { and, asc, desc, eq, gt, inArray, lt, or } from 'drizzle-orm';
import { z } from 'zod';

import { purchaseItems, purchaseItemSharedTags, purchases, sharedTagCache } from '../schema.js';
import { nowIso, type PurchasesDb } from './internal.js';

import type { SQL } from 'drizzle-orm';

import type { PurchaseItemRow, PurchaseItemSharedTagRow } from '../schema.js';

/** A shared-tag attachment named an item that Purchases does not hold. */
export class PurchaseItemNotFoundForSharedTagError extends Error {
  readonly itemId: string;

  constructor(itemId: string) {
    super('Purchase item ' + itemId + ' not found');
    this.name = 'PurchaseItemNotFoundForSharedTagError';
    this.itemId = itemId;
  }
}

/** A shared-tag attachment named an id absent from the latest vocabulary cache. */
export class UnknownSharedTagIdError extends Error {
  readonly tagId: string;

  constructor(tagId: string) {
    super('Shared tag id ' + tagId + ' is not in the vocabulary cache');
    this.name = 'UnknownSharedTagIdError';
    this.tagId = tagId;
  }
}

/** One item in the requested shared-tag set, reported once with its matches. */
export interface SharedTaggedItem {
  readonly item: PurchaseItemRow;
  readonly orderedAt: string;
  readonly tagIds: readonly string[];
}

/** Inputs for a stable page of line items carrying any requested tag id. */
export interface ListItemsBySharedTagIdsOptions {
  readonly tagIds: readonly string[];
  readonly cursor?: string;
  readonly limit: number;
}

/** A keyset page of line items and the requested shared ids that matched. */
export interface SharedTaggedItemPage {
  readonly rows: readonly SharedTaggedItem[];
  readonly nextCursor: string | null;
}

const SharedTagItemCursorSchema = z.object({
  version: z.literal(1),
  tagIds: z.array(z.string()).min(1),
  createdAt: z.string(),
  position: z.number().int(),
  itemId: z.string().min(1),
});

type SharedTagItemCursor = z.infer<typeof SharedTagItemCursorSchema>;

/**
 * Return a page ordered like listItemsByTag: createdAt descending, then line
 * position and id ascending. The cursor is bound to the requested id set so
 * a page cannot silently continue with different filters.
 *
 * Returns null when the cursor is malformed or belongs to another id set.
 */
export function listItemsBySharedTagIds(
  db: PurchasesDb,
  options: ListItemsBySharedTagIdsOptions
): SharedTaggedItemPage | null {
  const tagIds = [...new Set(options.tagIds)].toSorted();
  const cursor =
    options.cursor === undefined ? null : decodeSharedTagItemCursor(options.cursor, tagIds);
  if (options.cursor !== undefined && cursor === null) return null;
  if (tagIds.length === 0) return { rows: [], nextCursor: null };

  const candidates = db
    .selectDistinct({ item: purchaseItems, orderedAt: purchases.orderedAt })
    .from(purchaseItemSharedTags)
    .innerJoin(purchaseItems, eq(purchaseItems.id, purchaseItemSharedTags.itemId))
    .innerJoin(purchases, eq(purchases.id, purchaseItems.purchaseId))
    .where(
      and(
        inArray(purchaseItemSharedTags.tagId, tagIds),
        cursor === null ? undefined : afterSharedTagItemCursor(cursor)
      )
    )
    .orderBy(desc(purchaseItems.createdAt), asc(purchaseItems.position), asc(purchaseItems.id))
    .limit(options.limit + 1)
    .all();

  const page = candidates.slice(0, options.limit);
  const itemIds = page.map(({ item }) => item.id);
  if (itemIds.length === 0) return { rows: [], nextCursor: null };

  const assignments = db
    .select({ itemId: purchaseItemSharedTags.itemId, tagId: purchaseItemSharedTags.tagId })
    .from(purchaseItemSharedTags)
    .where(inArray(purchaseItemSharedTags.itemId, itemIds))
    .all();
  const matchedTagIdsByItem = new Map<string, Set<string>>();
  for (const assignment of assignments) {
    const matches = matchedTagIdsByItem.get(assignment.itemId) ?? new Set<string>();
    matches.add(assignment.tagId);
    matchedTagIdsByItem.set(assignment.itemId, matches);
  }

  const rows = page.map(({ item, orderedAt }) => ({
    item,
    orderedAt,
    tagIds: tagIds.filter((tagId) => matchedTagIdsByItem.get(item.id)?.has(tagId) ?? false),
  }));
  const last = page.at(-1)?.item;
  return {
    rows,
    nextCursor:
      candidates.length > options.limit && last !== undefined
        ? encodeSharedTagItemCursor(last, tagIds)
        : null,
  };
}

/**
 * Attach a known shared tag to an existing purchase item.
 *
 * Repeating the same attachment leaves its original timestamps unchanged.
 * Throws a typed error when the item does not exist or the id is absent from
 * the last complete vocabulary cache.
 */
export function attachSharedTag(
  db: PurchasesDb,
  itemId: string,
  tagId: string
): PurchaseItemSharedTagRow {
  return db.transaction((tx) => {
    const knownTag = tx
      .select({ tagId: sharedTagCache.tagId })
      .from(sharedTagCache)
      .where(eq(sharedTagCache.tagId, tagId))
      .limit(1)
      .get();
    if (knownTag === undefined) throw new UnknownSharedTagIdError(tagId);

    const item = tx
      .select({ id: purchaseItems.id })
      .from(purchaseItems)
      .where(eq(purchaseItems.id, itemId))
      .limit(1)
      .get();
    if (item === undefined) throw new PurchaseItemNotFoundForSharedTagError(itemId);

    const now = nowIso();
    tx.insert(purchaseItemSharedTags)
      .values({ itemId, tagId, createdAt: now, confirmedAt: now })
      .onConflictDoNothing()
      .run();

    const attached = tx
      .select()
      .from(purchaseItemSharedTags)
      .where(
        and(eq(purchaseItemSharedTags.itemId, itemId), eq(purchaseItemSharedTags.tagId, tagId))
      )
      .limit(1)
      .get();
    if (attached === undefined) throw new Error('attachSharedTag did not leave an assignment');
    return attached;
  });
}

/** Remove an assignment if present; a repeated detach is a successful no-op. */
export function detachSharedTag(db: PurchasesDb, itemId: string, tagId: string): boolean {
  return (
    db
      .delete(purchaseItemSharedTags)
      .where(
        and(eq(purchaseItemSharedTags.itemId, itemId), eq(purchaseItemSharedTags.tagId, tagId))
      )
      .run().changes > 0
  );
}

function decodeSharedTagItemCursor(
  encoded: string,
  tagIds: readonly string[]
): SharedTagItemCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const cursor = SharedTagItemCursorSchema.safeParse(parsed);
  if (
    !cursor.success ||
    cursor.data.tagIds.length !== tagIds.length ||
    cursor.data.tagIds.some((tagId, index) => tagId !== tagIds[index])
  ) {
    return null;
  }
  return cursor.data;
}

function encodeSharedTagItemCursor(item: PurchaseItemRow, tagIds: readonly string[]): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      tagIds,
      createdAt: item.createdAt,
      position: item.position,
      itemId: item.id,
    }),
    'utf8'
  ).toString('base64url');
}

function afterSharedTagItemCursor(cursor: SharedTagItemCursor): SQL | undefined {
  return or(
    lt(purchaseItems.createdAt, cursor.createdAt),
    and(eq(purchaseItems.createdAt, cursor.createdAt), gt(purchaseItems.position, cursor.position)),
    and(
      eq(purchaseItems.createdAt, cursor.createdAt),
      eq(purchaseItems.position, cursor.position),
      gt(purchaseItems.id, cursor.itemId)
    )
  );
}

export { hasSharedTagId, listSharedTagIdsForItem } from './purchase-item-shared-tag-state.js';
