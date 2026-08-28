/**
 * Tag vocabulary persistence for the finance domain.
 *
 * The `tag_vocabulary` table holds the canonical set of tags that the user (or
 * the seed data) considers valid for tagging transactions. Since POPS-2606 each
 * row also carries its `facet` and the facet's `kind` — who may mint a value on
 * that axis — and a `usageCount` the vocabulary is ranked by.
 *
 * Standard service pattern: db-arg services, plain functions, no HTTP concerns.
 * No typed errors are exported because no function has a not-found path — an
 * empty vocabulary returns `[]`, upsert is idempotent, and incrementing an
 * absent tag is a no-op.
 */
import { and, eq, inArray, sql } from 'drizzle-orm';

import { tagVocabulary } from '../schema.js';
import { parseTagFacet, tagFacetKind, type TagFacetKind } from '../tag-facets.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape for callers that need the full record. */
export type TagVocabularyRow = typeof tagVocabulary.$inferSelect;

/** Source field discriminant — matches the schema enum. */
export type TagVocabularySource = 'seed' | 'user';

/**
 * Return the active vocabulary tags.
 *
 * No explicit ORDER BY — SQLite makes no ordering guarantee in that case. The
 * router treats the result as a set, so order is not observable to clients.
 * Callers that need a ranked list use {@link listVocabularyTagsByKind}.
 */
export function listVocabularyTags(db: FinanceDb): string[] {
  return db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.isActive, true))
    .all()
    .map((row) => row.tag);
}

/**
 * Return the active vocabulary tags of one kind, most-used first.
 *
 * The ordering is load-bearing rather than cosmetic: the categorizer prompt
 * presents the closed vocabulary in this order so the values that actually
 * carry the corpus lead. `tag` breaks ties so the result is deterministic for a
 * cold vocabulary, where every count is zero.
 */
export function listVocabularyTagsByKind(db: FinanceDb, kind: TagFacetKind): string[] {
  return db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(and(eq(tagVocabulary.isActive, true), eq(tagVocabulary.kind, kind)))
    .orderBy(sql`${tagVocabulary.usageCount} desc`, tagVocabulary.tag)
    .all()
    .map((row) => row.tag);
}

/**
 * Upsert a tag into the vocabulary, marking it active.
 *
 * On insert the row gets `(tag, facet, kind, source, isActive=true)` with the
 * default `created_at` and a zero usage count. `facet` and `kind` are derived
 * from the tag string rather than passed in — the `facet:value` encoding makes
 * them unambiguous, and deriving them here is what stops a caller inventing a
 * closed facet. On conflict (same `tag` PK) the existing row's `isActive` is
 * flipped back to true; `source` is left untouched so a seed tag re-added by a
 * user keeps its `seed` provenance, and `facet`/`kind` are refreshed so a row
 * written before this column existed is corrected in place.
 */
export function upsertVocabularyTag(db: FinanceDb, tag: string, source: TagVocabularySource): void {
  const { facet } = parseTagFacet(tag);
  const kind = tagFacetKind(facet);
  db.insert(tagVocabulary)
    .values({ tag, facet, kind, source, isActive: true })
    .onConflictDoUpdate({
      target: tagVocabulary.tag,
      set: { isActive: true, facet, kind },
    })
    .run();
}

/**
 * Bump the usage count of every named tag that is already in the vocabulary.
 *
 * Deliberately does not insert: a tag absent from the vocabulary is not given
 * standing by being used, which is the ratchet POPS-2606 removes. Duplicate
 * entries in `tags` count once — a transaction carrying a tag twice used it
 * once.
 */
export function incrementVocabularyUsage(db: FinanceDb, tags: readonly string[]): void {
  const distinct = Array.from(new Set(tags));
  if (distinct.length === 0) return;
  db.update(tagVocabulary)
    .set({ usageCount: sql`${tagVocabulary.usageCount} + 1` })
    .where(inArray(tagVocabulary.tag, distinct))
    .run();
}

/**
 * The comparison form of a tag: trimmed and lower-cased.
 *
 * Membership in the vocabulary is a question about the value, not about how it
 * was typed — `venue:Bar` and `venue:bar` are the same value. Exported so a
 * caller that has to key its own map by tag agrees with {@link KnownTagSet}
 * rather than inventing a second normalisation.
 */
export function normalizeTagForComparison(tag: string): string {
  return tag.trim().toLowerCase();
}

/**
 * The set of tags the vocabulary confers standing on, answering the single
 * question "is this tag known".
 *
 * Exists so the readers that ask it cannot drift apart: before POPS-2602 the
 * suggester tested `isNew` against the closed vocabulary alone while the
 * tag-rule preview tested it against the whole active one, so the same tag was
 * new on one screen and not on the other.
 */
export interface KnownTagSet {
  /** True when `tag` is in the active vocabulary, compared case-insensitively. */
  has(tag: string): boolean;
  /** How many distinct tags the set holds. */
  readonly size: number;
}

/**
 * Build a {@link KnownTagSet} over an in-memory tag list.
 *
 * A blank or whitespace-only entry is dropped rather than admitted: it is not a
 * tag, and admitting it would make `has('')` true and so report an empty tag as
 * already known.
 */
export function createKnownTagSet(tags: Iterable<string>): KnownTagSet {
  const normalized = new Set<string>();
  for (const tag of tags) {
    const key = normalizeTagForComparison(tag);
    if (key !== '') normalized.add(key);
  }
  return {
    has: (tag) => {
      const key = normalizeTagForComparison(tag);
      return key !== '' && normalized.has(key);
    },
    get size() {
      return normalized.size;
    },
  };
}

/** The active vocabulary as a {@link KnownTagSet}. */
export function loadKnownTagSet(db: FinanceDb): KnownTagSet {
  return createKnownTagSet(listVocabularyTags(db));
}

/** Whether one tag is in the active vocabulary. Prefer {@link loadKnownTagSet} in a loop. */
export function isKnownTag(db: FinanceDb, tag: string): boolean {
  return loadKnownTagSet(db).has(tag);
}
