/** Cross-order reads keyed on an item tag rather than an order. */
import { and, asc, count, desc, eq, gt, lt, or } from 'drizzle-orm';
import { z } from 'zod';

import { purchaseItems, purchaseItemTags } from '../schema.js';
import { type PurchasesDb } from './internal.js';
import { containsLiteralInsensitive } from './search-text.js';

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

/** How many distinct tags {@link listTagVocabulary} will ever return. */
export const TAG_VOCABULARY_LIMIT = 100;

/** One tag in {@link listTagVocabulary}'s vocabulary, with its use count. */
export interface TagVocabularyEntry {
  readonly tag: string;
  readonly count: number;
}

/**
 * The distinct item tags in use, each with how many lines carry it, ordered
 * by that count descending then the tag itself ascending — most-used first,
 * with a stable tie-break — so a caller offering a "browse by tag" checklist
 * can order it the way a chooser expects rather than alphabetically, and show
 * the count alongside it (POPS-4544). A tag used once is as legitimate a
 * choice as one used a thousand times, so nothing here drops the tail — it is
 * capped, not filtered.
 */
export function listTagVocabulary(
  db: PurchasesDb,
  limit = TAG_VOCABULARY_LIMIT
): readonly TagVocabularyEntry[] {
  return db
    .select({ tag: purchaseItemTags.tag, count: count() })
    .from(purchaseItemTags)
    .groupBy(purchaseItemTags.tag)
    .orderBy(desc(count()), asc(purchaseItemTags.tag))
    .limit(limit)
    .all();
}

const TagVocabularyCursorSchema = z.object({
  version: z.literal(1),
  search: z.string().nullable(),
  count: z.number().int().nonnegative(),
  tag: z.string().min(1),
});

interface TagVocabularyCursor {
  readonly search: string | null;
  readonly count: number;
  readonly tag: string;
}

export interface TagVocabularyPageOptions {
  readonly search?: string;
  readonly cursor?: string;
  readonly limit: number;
}

export interface TagVocabularyPage {
  readonly tags: readonly TagVocabularyEntry[];
  readonly nextCursor: string | null;
}

function decodeTagVocabularyCursor(
  encoded: string,
  search: string | undefined
): TagVocabularyCursor | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return null;
  }

  const cursor = TagVocabularyCursorSchema.safeParse(parsed);
  if (!cursor.success || cursor.data.search !== (search ?? null)) return null;
  return cursor.data;
}

function encodeTagVocabularyCursor(entry: TagVocabularyEntry, search: string | undefined): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      search: search ?? null,
      count: entry.count,
      tag: entry.tag,
    }),
    'utf8'
  ).toString('base64url');
}

/**
 * Return a bounded page of the complete tag vocabulary, ordered by use count
 * descending and tag ascending. The search predicate is applied before the
 * page limit, and the continuation token is valid only for the same search.
 *
 * `null` means the cursor is malformed or belongs to another search.
 */
export function listTagVocabularyPage(
  db: PurchasesDb,
  options: TagVocabularyPageOptions
): TagVocabularyPage | null {
  const cursor =
    options.cursor === undefined ? null : decodeTagVocabularyCursor(options.cursor, options.search);
  if (options.cursor !== undefined && cursor === null) return null;

  const tagCount = count();
  const rows = db
    .select({ tag: purchaseItemTags.tag, count: tagCount })
    .from(purchaseItemTags)
    .where(
      options.search === undefined
        ? undefined
        : containsLiteralInsensitive(purchaseItemTags.tag, options.search)
    )
    .groupBy(purchaseItemTags.tag)
    .having(
      cursor === null
        ? undefined
        : or(
            lt(tagCount, cursor.count),
            and(eq(tagCount, cursor.count), gt(purchaseItemTags.tag, cursor.tag))
          )
    )
    .orderBy(desc(tagCount), asc(purchaseItemTags.tag))
    .limit(options.limit + 1)
    .all();

  const tags = rows.slice(0, options.limit);
  const last = tags.at(-1);
  return {
    tags,
    nextCursor:
      rows.length > options.limit && last !== undefined
        ? encodeTagVocabularyCursor(last, options.search)
        : null,
  };
}
