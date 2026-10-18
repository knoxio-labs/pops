import { inArray } from 'drizzle-orm';

import { itemFieldValues, items, locations } from '../db/schema.js';
import { loadPublishedCatalogue } from './catalogue.js';
import { referenceValue } from './item-value-references.js';
import { parseSyncValue } from './item-value-sync-read.js';
import { ItemFieldSetError } from './item-value-types.js';
import { readIdBatches } from './read-id-batches.js';

import type { CommandDb } from '../db/command-db.js';
import type { ItemFieldValueRow } from '../db/row-types.js';
import type { PersistedCatalogue, PersistedItemType } from './catalogue-types.js';
import type { ReadItemFieldValue, ReferenceTargetState } from './item-value-types.js';
import type { ReferenceWireValue } from './value-types.js';

type CatalogueRead =
  | { readonly state: 'loaded'; readonly catalogue: PersistedCatalogue | null }
  | { readonly state: 'failed'; readonly error: unknown };

function rawReference(valueJson: string): ReferenceWireValue | null {
  try {
    const value: unknown = JSON.parse(valueJson);
    if (
      typeof value === 'object' &&
      value !== null &&
      'targetKind' in value &&
      (value.targetKind === 'item' || value.targetKind === 'location') &&
      'targetId' in value &&
      typeof value.targetId === 'string'
    ) {
      return { targetKind: value.targetKind, targetId: value.targetId };
    }
  } catch {
    return null;
  }
  return null;
}

function loadReferenceStates(
  db: CommandDb,
  table: typeof items | typeof locations,
  ids: ReadonlySet<string>,
  states: Map<string, ReferenceTargetState>
): void {
  if (ids.size === 0) return;
  for (const id of ids) states.set(id, 'missing');
  const targets = readIdBatches([...ids]).flatMap((batch) =>
    db
      .select({ id: table.id, deletedAt: table.deletedAt })
      .from(table)
      .where(inArray(table.id, batch))
      .all()
  );
  for (const target of targets) {
    states.set(target.id, target.deletedAt === null ? 'resolved' : 'deleted');
  }
}

/**
 * Request-scoped canonical value reads. Root rows and reference target states
 * are loaded in batches; catalogue revisions, including failures, are shared
 * across items. Parsing stays item-scoped so a malformed row cannot abort peers.
 */
export class ItemValueReader {
  readonly #rows = new Map<string, readonly ItemFieldValueRow[]>();
  readonly #catalogues = new Map<number | undefined, CatalogueRead>();
  readonly #itemTargets = new Map<string, ReferenceTargetState>();
  readonly #locationTargets = new Map<string, ReferenceTargetState>();

  constructor(
    private readonly db: CommandDb,
    itemIds: readonly string[] = []
  ) {
    this.preload(itemIds);
  }

  /** Loads missing items' rows together, retaining canonical field/ordinal order. */
  preload(itemIds: readonly string[]): void {
    const missing = [...new Set(itemIds)].filter((itemId) => !this.#rows.has(itemId));
    if (missing.length === 0) return;
    const rows = readIdBatches(missing).flatMap((batch) =>
      this.db
        .select()
        .from(itemFieldValues)
        .where(inArray(itemFieldValues.itemId, batch))
        .orderBy(
          itemFieldValues.fieldId,
          itemFieldValues.source,
          itemFieldValues.catalogueRevision,
          itemFieldValues.ordinal
        )
        .all()
    );
    const grouped = new Map<string, ItemFieldValueRow[]>();
    for (const itemId of missing) grouped.set(itemId, []);
    for (const row of rows) grouped.get(row.itemId)?.push(row);
    for (const [itemId, values] of grouped) this.#rows.set(itemId, values);
    this.preloadReferences(rows);
  }

  /** Returns raw rows for compatibility projection without parsing canonical values. */
  rows(itemId: string): readonly ItemFieldValueRow[] {
    this.preload([itemId]);
    return this.#rows.get(itemId) ?? [];
  }

  /** Returns a stored reference identity for dependency preloading without parsing peer fields. */
  storedReference(itemId: string, fieldId: string): ReferenceWireValue | null {
    const row = this.rows(itemId).find(
      (entry) => entry.fieldId === fieldId && entry.source === 'stored' && entry.ordinal === 0
    );
    return row === undefined ? null : rawReference(row.valueJson);
  }

  /** Shares current or historical published snapshots within this read transaction. */
  catalogue(revision?: number): PersistedCatalogue | null {
    let result = this.#catalogues.get(revision);
    if (result === undefined) {
      try {
        result = { state: 'loaded', catalogue: loadPublishedCatalogue(this.db, revision) };
      } catch (error) {
        result = { state: 'failed', error };
      }
      this.#catalogues.set(revision, result);
    }
    if (result.state === 'failed') throw result.error;
    return result.catalogue;
  }

  /** Resolves the revision-1 compatibility type from this request's cached snapshot. */
  protocol1Type(typeId: string | null): PersistedItemType | null {
    return typeId === null
      ? null
      : (this.catalogue(1)?.types.find((candidate) => candidate.id === typeId) ?? null);
  }

  /** Reads one item's values, optionally preserving structurally valid legacy sync values. */
  read(itemId: string, preserveStructurallyValidValues = false): readonly ReadItemFieldValue[] {
    const result: ReadItemFieldValue[] = [];
    for (const row of this.rows(itemId)) {
      const field = this.catalogue(row.catalogueRevision)
        ?.types.flatMap((type) => type.fields)
        .find((entry) => entry.id === row.fieldId);
      if (!field) {
        if (preserveStructurallyValidValues) continue;
        throw new ItemFieldSetError(
          'field_unknown',
          row.fieldId,
          'stored definition is unavailable'
        );
      }
      const value = parseSyncValue(field, row.valueJson, preserveStructurallyValidValues);
      const reference = referenceValue(value);
      const parsed = reference
        ? { ...reference, targetState: this.referenceState(reference) }
        : value;
      const previous = result.at(-1);
      if (
        previous?.fieldId === row.fieldId &&
        previous.source === row.source &&
        previous.catalogueRevision === row.catalogueRevision
      ) {
        result[result.length - 1] = { ...previous, values: [...previous.values, parsed] };
      } else {
        result.push({
          fieldId: row.fieldId,
          source: row.source,
          catalogueRevision: row.catalogueRevision,
          values: [parsed],
        });
      }
    }
    return result;
  }

  private referenceState(reference: ReferenceWireValue): ReferenceTargetState {
    const targets = reference.targetKind === 'item' ? this.#itemTargets : this.#locationTargets;
    return targets.get(reference.targetId) ?? 'missing';
  }

  private preloadReferences(rows: readonly ItemFieldValueRow[]): void {
    const itemIds = new Set<string>();
    const locationIds = new Set<string>();
    for (const row of rows) {
      const reference = rawReference(row.valueJson);
      if (reference?.targetKind === 'item' && !this.#itemTargets.has(reference.targetId)) {
        itemIds.add(reference.targetId);
      } else if (
        reference?.targetKind === 'location' &&
        !this.#locationTargets.has(reference.targetId)
      ) {
        locationIds.add(reference.targetId);
      }
    }
    loadReferenceStates(this.db, items, itemIds, this.#itemTargets);
    loadReferenceStates(this.db, locations, locationIds, this.#locationTargets);
  }
}
