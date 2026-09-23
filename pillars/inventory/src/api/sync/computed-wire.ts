import {
  loadPublishedCatalogue,
  readEffectiveItemFieldValuesForItems,
  type EffectiveItemFieldValue,
  type ReadItemFieldValue,
} from '../../catalogue/index.js';

import type { SyncComputedValue } from '../../contract/rest-sync-computed-schemas.js';
import type { CommandDb } from '../../domain/commands/index.js';

type EvaluatedDependency = SyncComputedValue['dependencies'][number];

function traversed(rootItemId: string, dependencies: readonly EvaluatedDependency[]): string[] {
  return [...new Set([rootItemId, ...dependencies.map((dependency) => dependency.itemId)])];
}

function overrideRevision(persisted: readonly ReadItemFieldValue[], fieldId: string): number {
  const override = persisted.find(
    (entry) => entry.fieldId === fieldId && entry.source === 'override'
  );
  if (override === undefined) throw new Error(`override of ${fieldId} has no persisted row`);
  return override.catalogueRevision;
}

/**
 * Projects one effective computed value onto the sync wire. `persisted` must
 * hold the override row when `value` is overridden; its revision is reported.
 * `ok` reports the root and every item a dependency names as traversed.
 */
export function toComputedWire(
  itemId: string,
  value: EffectiveItemFieldValue,
  persisted: readonly ReadItemFieldValue[]
): SyncComputedValue | null {
  if (value.state === 'unavailable') {
    return {
      fieldId: value.fieldId,
      source: 'computed',
      catalogueRevision: value.provenance.catalogueRevision,
      state: 'unavailable',
      reason: value.reason,
      failedFieldId: value.failedFieldId,
      dependencies: [...value.provenance.dependencies],
      traversedItemIds: [...value.traversedItemIds],
    };
  }
  const { provenance } = value;
  if (provenance.source === 'stored') return null;
  const values = [value.values[0]];
  if (provenance.source === 'override') {
    return {
      fieldId: value.fieldId,
      source: 'computed',
      catalogueRevision: provenance.catalogueRevision,
      state: 'overridden',
      values,
      override: { catalogueRevision: overrideRevision(persisted, value.fieldId) },
      dependencies: [],
      traversedItemIds: [],
    };
  }
  return {
    fieldId: value.fieldId,
    source: 'computed',
    catalogueRevision: provenance.catalogueRevision,
    state: 'ok',
    values,
    dependencies: [...provenance.dependencies],
    traversedItemIds: traversed(itemId, provenance.dependencies),
  };
}

/**
 * Evaluates every computed field of `ids` against the active published
 * catalogue, through one dependency snapshot in the caller's read
 * transaction. Items without a type, or a database without a published
 * catalogue, have none.
 */
export function loadComputedValues(
  db: CommandDb,
  ids: readonly string[],
  persisted: ReadonlyMap<string, readonly ReadItemFieldValue[]>
): ReadonlyMap<string, readonly SyncComputedValue[]> {
  const catalogue = loadPublishedCatalogue(db);
  if (catalogue === null || ids.length === 0) return new Map();
  const effective = readEffectiveItemFieldValuesForItems(db, catalogue, ids);
  return new Map(
    ids.map((itemId) => [
      itemId,
      (effective.get(itemId) ?? []).flatMap((value) => {
        const wire = toComputedWire(itemId, value, persisted.get(itemId) ?? []);
        return wire === null ? [] : [wire];
      }),
    ])
  );
}
