import { and, asc, eq, gt, inArray, isNull } from 'drizzle-orm';

import { events, items } from '../db/schema.js';
import { appendEvent } from '../domain/commands/events.js';
import { readComputedDependents } from './computed-dependency-index.js';

import type { CommandDb } from '../domain/commands/entities.js';
import type { PersistedCatalogue, PersistedItemTypeField } from './catalogue-types.js';

/** The event kind a publication records for an item whose computed values it changed. */
export const RECOMPUTED_EVENT_KIND = 'recomputed';

function computedSignature(field: PersistedItemTypeField | undefined): string | null {
  if (field === undefined || field.storage !== 'computed' || field.archivedAt !== null) return null;
  return JSON.stringify([field.expressionVersion, field.expressionJson, field.allowOverride]);
}

/**
 * Types whose live computed definitions differ between `base` and
 * `published`: a computed field added, archived or restored, its expression
 * replaced, or its override policy changed. Every item of such a type may
 * evaluate differently afterwards.
 */
export function typesWithChangedComputedDefinitions(
  base: PersistedCatalogue,
  published: PersistedCatalogue
): string[] {
  const baseTypes = new Map(base.types.map((type) => [type.id, type]));
  return published.types
    .filter((type) => {
      const baseFields = new Map(
        (baseTypes.get(type.id)?.fields ?? []).map((field) => [field.id, field])
      );
      const fieldIds = new Set([...baseFields.keys(), ...type.fields.map((field) => field.id)]);
      const current = new Map(type.fields.map((field) => [field.id, field]));
      return [...fieldIds].some(
        (id) => computedSignature(baseFields.get(id)) !== computedSignature(current.get(id))
      );
    })
    .map((type) => type.id);
}

function liveItemsOfTypes(db: CommandDb, typeIds: readonly string[]): string[] {
  if (typeIds.length === 0) return [];
  return db
    .select({ id: items.id })
    .from(items)
    .where(and(inArray(items.typeId, [...typeIds]), isNull(items.deletedAt)))
    .orderBy(asc(items.id))
    .all()
    .map((row) => row.id);
}

function itemsWithEventsAfter(db: CommandDb, sinceSeq: number): string[] {
  return db
    .selectDistinct({ id: events.entityId })
    .from(events)
    .where(and(gt(events.seq, sinceSeq), eq(events.entityKind, 'item')))
    .all()
    .map((row) => row.id);
}

function recordRecomputed(
  db: CommandDb,
  itemIds: readonly string[],
  revision: number,
  now: string
): void {
  for (const id of itemIds) {
    const row = db.select({ revision: items.revision }).from(items).where(eq(items.id, id)).get();
    if (row === undefined) continue;
    const seq = appendEvent(db, {
      entityKind: 'item',
      entityId: id,
      kind: RECOMPUTED_EVENT_KIND,
      before: {},
      after: {},
      reason: `catalogue revision ${revision}`,
      entityRevision: row.revision,
      actor: { kind: 'migration', id: `catalogue-${revision}`, label: 'Catalogue' },
      mutationId: null,
      compensatesSeq: null,
      clientTime: null,
      serverTime: now,
    });
    db.update(items).set({ seq }).where(eq(items.id, id)).run();
  }
}

/** What a publication re-sends; see {@link resendAfterPublication}. */
export interface PublicationResendInput {
  readonly base: PersistedCatalogue;
  readonly published: PersistedCatalogue;
  /** The latest `seq` before the publication appended anything. */
  readonly sinceSeq: number;
  readonly now: string;
  /** Cap on the reverse-index dependents re-sent; the changed types' own items are not capped. */
  readonly dependentLimit: number;
}

/**
 * Re-sends, in the publication's transaction and after the reverse-dependency
 * index was rebuilt against `published`, every item whose computed values the
 * publication changed without writing it (Inventory ADR-002 D5): each live
 * item of a type whose computed definitions changed, and up to
 * `dependentLimit` live index dependents (lowest ids first) of those items and
 * of every item the publication's migration wrote.
 *
 * Each such item gets a `recomputed` event with no field changes at its
 * current revision, and its `seq` moves to that event, so the change feed
 * carries it with an evaluation against `published`. Items the migration
 * wrote already carry their own event and are not re-sent again. Returns the
 * re-sent ids in ascending order.
 */
export function resendAfterPublication(
  db: CommandDb,
  input: PublicationResendInput
): readonly string[] {
  const migrated = new Set(itemsWithEventsAfter(db, input.sinceSeq));
  const typeItems = liveItemsOfTypes(
    db,
    typesWithChangedComputedDefinitions(input.base, input.published)
  );
  const seeds = [...new Set([...migrated, ...typeItems])];
  const found = readComputedDependents(db, seeds, input.dependentLimit + 1);
  if (found.length > input.dependentLimit) {
    console.warn('[inventory] computed dependents exceed the per-publication re-send limit', {
      catalogueRevision: input.published.revision.revision,
      limit: input.dependentLimit,
    });
  }
  const resent = [...new Set([...typeItems, ...found.slice(0, input.dependentLimit)])]
    .filter((id) => !migrated.has(id))
    .toSorted();
  recordRecomputed(db, resent, input.published.revision.revision, input.now);
  return resent;
}
