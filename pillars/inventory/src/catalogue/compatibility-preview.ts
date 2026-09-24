import { and, countDistinct, eq, inArray, isNull } from 'drizzle-orm';

import { itemFieldValues, items } from '../db/schema.js';
import { classifyCatalogueCompatibility } from './compatibility.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { PersistedCatalogue } from './catalogue-types.js';
import type { CatalogueCompatibilityResult } from './compatibility.js';

/** Live items holding an override on a computed field whose overrides a draft disables. */
export interface DiscardedOverrides {
  readonly fieldId: string;
  readonly items: number;
}

/** A compatibility proof plus the live data it would touch. */
export interface CatalogueCompatibilityAssessment extends CatalogueCompatibilityResult {
  readonly affectedItems: number;
  readonly discardedOverrides: readonly DiscardedOverrides[];
}

function affectedTypeIds(
  catalogues: readonly PersistedCatalogue[],
  definitionIds: readonly string[]
): string[] {
  const affected = new Set(definitionIds);
  const typeIds = new Set<string>();
  for (const catalogue of catalogues) {
    for (const type of catalogue.types) {
      if (affected.has(type.id)) typeIds.add(type.id);
      if (
        type.fields.some(
          (field) =>
            affected.has(field.id) || field.enumOptions.some((option) => affected.has(option.id))
        )
      ) {
        typeIds.add(type.id);
      }
    }
  }
  return [...typeIds];
}

/** Counts live items whose type contains a definition changed by the draft. */
export function countCompatibilityAffectedItems(
  db: CommandDb,
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  definitionIds: readonly string[]
): number {
  const typeIds = affectedTypeIds([base, candidate], definitionIds);
  if (typeIds.length === 0) return 0;
  const row = db
    .select({ count: countDistinct(items.id) })
    .from(items)
    .where(and(isNull(items.deletedAt), inArray(items.typeId, typeIds)))
    .get();
  return row?.count ?? 0;
}

function overrideDisabledFieldIds(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue
): string[] {
  const candidateFields = new Map(
    candidate.types.flatMap((type) => type.fields).map((field) => [field.id, field])
  );
  return base.types
    .flatMap((type) => type.fields)
    .filter(
      (field) => field.allowOverride && candidateFields.get(field.id)?.allowOverride === false
    )
    .map((field) => field.id);
}

/** Counts, per computed field whose overrides the candidate disables, the live items holding one. */
export function findDiscardedOverrides(
  db: CommandDb,
  base: PersistedCatalogue,
  candidate: PersistedCatalogue
): DiscardedOverrides[] {
  const fieldIds = overrideDisabledFieldIds(base, candidate);
  if (fieldIds.length === 0) return [];
  return db
    .select({ fieldId: itemFieldValues.fieldId, items: countDistinct(itemFieldValues.itemId) })
    .from(itemFieldValues)
    .innerJoin(items, eq(items.id, itemFieldValues.itemId))
    .where(
      and(
        eq(itemFieldValues.source, 'override'),
        isNull(items.deletedAt),
        inArray(itemFieldValues.fieldId, fieldIds)
      )
    )
    .groupBy(itemFieldValues.fieldId)
    .orderBy(itemFieldValues.fieldId)
    .all()
    .filter((entry) => entry.items > 0);
}

/**
 * Classifies a candidate against its base using live override holdings, and
 * counts the items the publication would affect and the overrides it would discard.
 */
export function assessCatalogueCompatibility(
  db: CommandDb,
  base: PersistedCatalogue,
  candidate: PersistedCatalogue
): CatalogueCompatibilityAssessment {
  const discardedOverrides = findDiscardedOverrides(db, base, candidate);
  const compatibility = classifyCatalogueCompatibility(
    base,
    candidate,
    new Set(discardedOverrides.map((entry) => entry.fieldId))
  );
  return {
    ...compatibility,
    affectedItems: countCompatibilityAffectedItems(db, base, candidate, compatibility.affectedIds),
    discardedOverrides,
  };
}
