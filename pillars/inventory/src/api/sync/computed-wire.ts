import {
  loadPublishedCatalogue,
  readEffectiveItemFieldValues,
  type EffectiveItemFieldValue,
  type ReadItemFieldValue,
} from '../../catalogue/index.js';

import type { SyncComputedValue } from '../../contract/rest-sync-computed-schemas.js';
import type { CommandDb } from '../../domain/commands/index.js';
import type { SyncItemProjectionIssue } from './wire-types.js';

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
      missingInputs: value.missingInputs.map((input) => ({ ...input })),
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

/** Computed values and item-scoped issues produced during one sync read. */
export interface ComputedValuesProjection {
  readonly values: ReadonlyMap<string, readonly SyncComputedValue[]>;
  readonly issues: ReadonlyMap<string, readonly SyncItemProjectionIssue[]>;
}

function projectionIssue(fieldId: string | null, message: string): SyncItemProjectionIssue {
  return {
    fieldId,
    fieldKey: null,
    code: 'computed_projection_failed',
    message,
  };
}

function projectComputedValues(
  itemId: string,
  effective: readonly EffectiveItemFieldValue[],
  persisted: ReadonlyMap<string, readonly ReadItemFieldValue[]>,
  issues: Map<string, SyncItemProjectionIssue[]>
): SyncComputedValue[] {
  const projected: SyncComputedValue[] = [];
  for (const value of effective) {
    try {
      const wire = toComputedWire(itemId, value, persisted.get(itemId) ?? []);
      if (wire !== null) projected.push(wire);
    } catch (error) {
      console.error('[inventory-sync] computed value projection failed', {
        itemId,
        fieldId: value.fieldId,
        error,
      });
      const itemIssues = issues.get(itemId) ?? [];
      itemIssues.push(
        projectionIssue(
          value.fieldId,
          'A computed value could not be prepared for sync. No value was changed.'
        )
      );
      issues.set(itemId, itemIssues);
    }
  }
  return projected;
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
): ComputedValuesProjection {
  const catalogue = loadPublishedCatalogue(db);
  if (catalogue === null || ids.length === 0) {
    return { values: new Map(), issues: new Map() };
  }
  const effective = new Map<string, readonly EffectiveItemFieldValue[]>();
  const issues = new Map<string, SyncItemProjectionIssue[]>();
  for (const itemId of ids) {
    try {
      effective.set(itemId, readEffectiveItemFieldValues(db, catalogue, itemId));
    } catch (error) {
      console.error('[inventory-sync] computed projection failed', { itemId, error });
      effective.set(itemId, []);
      issues.set(itemId, [
        projectionIssue(
          null,
          'A computed value could not be evaluated for this item. No value was changed.'
        ),
      ]);
    }
  }
  const values = new Map<string, SyncComputedValue[]>();
  for (const itemId of ids) {
    values.set(
      itemId,
      projectComputedValues(itemId, effective.get(itemId) ?? [], persisted, issues)
    );
  }
  return { values, issues };
}
