/**
 * Local persistence for links to the shared tags vocabulary.
 *
 * Finance keeps its own tag strings and usage counts. A shared tag id is only
 * a link: a remote rename never rewrites the local tag value.
 */
import { and, eq, inArray, isNull } from 'drizzle-orm';

import { tagVocabulary } from '../schema.js';
import { SHARED_TAG_FACETS, tagFacetKind } from '../tag-facets.js';

import type { FinanceDb } from './internal.js';

export type SharedTagVocabularyRow = typeof tagVocabulary.$inferSelect;

export type SharedTagLinkResult =
  | { kind: 'linked'; tag: string }
  | { kind: 'already-linked'; tag: string }
  | { kind: 'updated'; tag: string }
  | { kind: 'conflict'; reason: 'shared-id' | 'local-tag'; existingTag: string }
  | { kind: 'missing'; tag: string }
  | { kind: 'invalid-name'; facet: string; name: string };

/** List active, unlinked local values on the shared facets, in stable order. */
export function listUnlinkedActiveSharedVocabularyTags(db: FinanceDb): SharedTagVocabularyRow[] {
  return db
    .select()
    .from(tagVocabulary)
    .where(
      and(
        eq(tagVocabulary.isActive, true),
        isNull(tagVocabulary.sharedTagId),
        inArray(tagVocabulary.facet, [...SHARED_TAG_FACETS])
      )
    )
    .orderBy(tagVocabulary.tag)
    .all();
}

/** Find local vocabulary rows already linked to any of the supplied shared ids. */
export function listVocabularyTagsBySharedIds(
  db: FinanceDb,
  sharedTagIds: readonly string[]
): SharedTagVocabularyRow[] {
  if (sharedTagIds.length === 0) return [];
  return db
    .select()
    .from(tagVocabulary)
    .where(inArray(tagVocabulary.sharedTagId, [...sharedTagIds]))
    .orderBy(tagVocabulary.tag)
    .all();
}

/** Link one existing local value without changing its text or usage count. */
export function linkVocabularyTag(
  db: FinanceDb,
  input: { tag: string; sharedTagId: string; isActive: boolean }
): SharedTagLinkResult {
  const bySharedId = db
    .select({ tag: tagVocabulary.tag })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.sharedTagId, input.sharedTagId))
    .get();
  if (bySharedId !== undefined && bySharedId.tag !== input.tag) {
    return { kind: 'conflict', reason: 'shared-id', existingTag: bySharedId.tag };
  }

  const local = db
    .select({ sharedTagId: tagVocabulary.sharedTagId, isActive: tagVocabulary.isActive })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.tag, input.tag))
    .get();
  if (local === undefined) return { kind: 'missing', tag: input.tag };
  if (local.sharedTagId !== null && local.sharedTagId !== input.sharedTagId) {
    return { kind: 'conflict', reason: 'local-tag', existingTag: input.tag };
  }

  if (local.sharedTagId === input.sharedTagId) {
    if (local.isActive !== input.isActive) {
      db.update(tagVocabulary)
        .set({ isActive: input.isActive })
        .where(eq(tagVocabulary.tag, input.tag))
        .run();
      return { kind: 'updated', tag: input.tag };
    }
    return { kind: 'already-linked', tag: input.tag };
  }

  const update = db
    .update(tagVocabulary)
    .set({ sharedTagId: input.sharedTagId, isActive: input.isActive })
    .where(and(eq(tagVocabulary.tag, input.tag), isNull(tagVocabulary.sharedTagId)))
    .run();
  if (update.changes === 1) return { kind: 'linked', tag: input.tag };

  // Re-read after the compare-and-set so a concurrent sync is reported rather
  // than overwriting another local/shared mapping.
  return linkVocabularyTag(db, input);
}

/**
 * Upsert the local slug for one shared tag and link it. Existing local strings
 * win by shared id, so a remote rename never changes the Finance vocabulary.
 */
export function upsertSharedTagVocabulary(
  db: FinanceDb,
  input: { sharedTagId: string; facet: string; name: string; isActive: boolean }
): SharedTagLinkResult {
  const tag = localTagForSharedName(input.facet, input.name);
  if (tag === null) return { kind: 'invalid-name', facet: input.facet, name: input.name };

  const existing = db
    .select({ tag: tagVocabulary.tag, isActive: tagVocabulary.isActive })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.sharedTagId, input.sharedTagId))
    .get();
  if (existing !== undefined) {
    if (existing.isActive !== input.isActive) {
      db.update(tagVocabulary)
        .set({ isActive: input.isActive })
        .where(eq(tagVocabulary.tag, existing.tag))
        .run();
      return { kind: 'updated', tag: existing.tag };
    }
    return { kind: 'already-linked', tag: existing.tag };
  }

  const byTag = db
    .select({ sharedTagId: tagVocabulary.sharedTagId })
    .from(tagVocabulary)
    .where(eq(tagVocabulary.tag, tag))
    .get();
  if (byTag !== undefined) {
    return linkVocabularyTag(db, {
      tag,
      sharedTagId: input.sharedTagId,
      isActive: input.isActive,
    });
  }

  const insert = db
    .insert(tagVocabulary)
    .values({
      tag,
      facet: input.facet,
      kind: tagFacetKind(input.facet),
      source: 'user',
      sharedTagId: input.sharedTagId,
      isActive: input.isActive,
    })
    .onConflictDoNothing()
    .run();
  if (insert.changes === 1) return { kind: 'linked', tag };

  // A concurrent insert may have claimed either unique key. Resolve it with
  // the same guarded link path, preserving whichever mapping won.
  return linkVocabularyTag(db, { tag, sharedTagId: input.sharedTagId, isActive: input.isActive });
}

/** Convert a shared facet/name to the Finance vocabulary key, or null if empty. */
export function localTagForSharedName(facet: string, name: string): string | null {
  const value = slugifySharedTagName(name);
  return value === '' ? null : `${facet}:${value}`;
}

function slugifySharedTagName(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
