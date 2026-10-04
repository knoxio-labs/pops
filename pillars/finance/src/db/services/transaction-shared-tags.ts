/** Persistence for shared-tag assignments on Finance transactions. */
import { and, desc, eq, inArray, lt, or, sql, type SQL } from 'drizzle-orm';

import { assertNoFeeTagsOnNonFeeType } from '../fee-tag-guard.js';
import { transactions, tagVocabulary } from '../schema.js';
import { mergeTagsWithinFacetLimits, parseStoredTags, parseTagFacet } from '../tag-facets.js';
import { listVocabularyTagsBySharedIds } from './shared-tag-links.js';
import { applyVocabularyUsageDelta } from './tag-vocabulary.js';

import type { FinanceDb, TransactionRow } from './internal.js';

/** Keyset anchor matching `transactions-list.ts`'s `date DESC, id DESC` order. */
export interface TransactionSharedTagCursor {
  beforeDate: string;
  beforeId: string;
}

/** A transaction row and the requested shared ids it carries. */
export type SharedTaggedTransaction = TransactionRow & { tagIds: string[] };

/** One keyset page of transactions carrying any requested shared tag. */
export interface SharedTaggedTransactionsPage {
  items: SharedTaggedTransaction[];
  nextCursor: TransactionSharedTagCursor | null;
}

/** Typed outcomes for attaching or detaching one shared tag. */
export type SharedTagMutationResult =
  | { kind: 'updated'; tagIds: string[] }
  | { kind: 'unchanged'; tagIds: string[] }
  | { kind: 'unknown-tag'; tagId: string }
  | { kind: 'transaction-not-found'; transactionId: string }
  | { kind: 'facet-conflict'; tagId: string; facet: string };

function keysetCondition(cursor: TransactionSharedTagCursor | undefined): SQL | undefined {
  if (cursor === undefined) return undefined;
  return or(
    lt(transactions.date, cursor.beforeDate),
    and(eq(transactions.date, cursor.beforeDate), lt(transactions.id, cursor.beforeId))
  );
}

/** List matching transactions in stable date/id order, without duplicate rows. */
export function listTransactionsBySharedTagIds(
  db: FinanceDb,
  tagIds: readonly string[],
  limit: number,
  cursor?: TransactionSharedTagCursor
): SharedTaggedTransactionsPage {
  const requestedIds = [...new Set(tagIds)];
  if (requestedIds.length === 0 || limit <= 0) return { items: [], nextCursor: null };

  const rows = listVocabularyTagsBySharedIds(db, requestedIds);
  const localTagById = new Map<string, string>();
  for (const row of rows) {
    if (row.sharedTagId !== null) localTagById.set(row.sharedTagId, row.tag);
  }
  const localTags = [...new Set(localTagById.values())];
  if (localTags.length === 0) return { items: [], nextCursor: null };

  const matchingTags = sql.join(
    localTags.map((tag) => sql`json_each.value = ${tag}`),
    sql` OR `
  );
  const conditions: SQL[] = [
    sql`EXISTS (SELECT 1 FROM json_each(${transactions.tags}) WHERE ${matchingTags})`,
  ];
  const keyset = keysetCondition(cursor);
  if (keyset !== undefined) conditions.push(keyset);

  const selected = db
    .select()
    .from(transactions)
    .where(and(...conditions))
    .orderBy(desc(transactions.date), desc(transactions.id))
    .limit(limit + 1)
    .all();
  const hasMore = selected.length > limit;
  const pageRows = selected.slice(0, limit);
  const items = pageRows.map((row) => {
    const carriedTags = new Set(parseStoredTags(row.tags));
    return {
      ...row,
      tagIds: requestedIds.filter((id) => {
        const localTag = localTagById.get(id);
        return localTag !== undefined && carriedTags.has(localTag);
      }),
    };
  });
  const last = hasMore ? pageRows.at(-1) : undefined;
  return {
    items,
    nextCursor: last === undefined ? null : { beforeDate: last.date, beforeId: last.id },
  };
}

function sharedIdsCarriedByTags(db: FinanceDb, tags: readonly string[]): string[] {
  const uniqueTags = [...new Set(tags)];
  if (uniqueTags.length === 0) return [];
  return db
    .select({ sharedTagId: tagVocabulary.sharedTagId })
    .from(tagVocabulary)
    .where(inArray(tagVocabulary.tag, uniqueTags))
    .all()
    .flatMap((row) => (row.sharedTagId === null ? [] : [row.sharedTagId]))
    .toSorted();
}

function persistTags(
  db: FinanceDb,
  transaction: TransactionRow,
  oldTags: readonly string[],
  newTags: readonly string[]
): SharedTagMutationResult {
  const update = db
    .update(transactions)
    .set({ tags: JSON.stringify(newTags), lastEditedTime: new Date().toISOString() })
    .where(eq(transactions.id, transaction.id))
    .run();
  if (update.changes === 0) {
    return { kind: 'transaction-not-found', transactionId: transaction.id };
  }
  applyVocabularyUsageDelta(db, oldTags, newTags);
  return { kind: 'updated', tagIds: sharedIdsCarriedByTags(db, newTags) };
}

/** Attach one mapped shared tag, preserving existing tags and usage counts atomically. */
export function attachSharedTag(
  db: FinanceDb,
  transactionId: string,
  tagId: string
): SharedTagMutationResult {
  return db.transaction((tx) => {
    const transaction = tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .get();
    if (transaction === undefined) return { kind: 'transaction-not-found', transactionId };
    const vocabulary = tx
      .select({ tag: tagVocabulary.tag })
      .from(tagVocabulary)
      .where(eq(tagVocabulary.sharedTagId, tagId))
      .get();
    if (vocabulary === undefined) return { kind: 'unknown-tag', tagId };

    const oldTags = parseStoredTags(transaction.tags);
    if (oldTags.includes(vocabulary.tag)) {
      return { kind: 'unchanged', tagIds: sharedIdsCarriedByTags(tx, oldTags) };
    }
    const merged = mergeTagsWithinFacetLimits(oldTags, [vocabulary.tag]);
    if (merged.dropped.length > 0) {
      const { facet } = parseTagFacet(vocabulary.tag);
      return { kind: 'facet-conflict', tagId, facet: facet ?? '' };
    }
    assertNoFeeTagsOnNonFeeType(transaction.type, merged.tags);
    return persistTags(tx, transaction, oldTags, merged.tags);
  });
}

/** Detach one mapped shared tag while leaving all other transaction tags intact. */
export function detachSharedTag(
  db: FinanceDb,
  transactionId: string,
  tagId: string
): SharedTagMutationResult {
  return db.transaction((tx) => {
    const transaction = tx
      .select()
      .from(transactions)
      .where(eq(transactions.id, transactionId))
      .get();
    if (transaction === undefined) return { kind: 'transaction-not-found', transactionId };
    const vocabulary = tx
      .select({ tag: tagVocabulary.tag })
      .from(tagVocabulary)
      .where(eq(tagVocabulary.sharedTagId, tagId))
      .get();
    if (vocabulary === undefined) return { kind: 'unknown-tag', tagId };

    const oldTags = parseStoredTags(transaction.tags);
    if (!oldTags.includes(vocabulary.tag)) {
      return { kind: 'unchanged', tagIds: sharedIdsCarriedByTags(tx, oldTags) };
    }
    const newTags = oldTags.filter((tag) => tag !== vocabulary.tag);
    assertNoFeeTagsOnNonFeeType(transaction.type, newTags);
    return persistTags(tx, transaction, oldTags, newTags);
  });
}
