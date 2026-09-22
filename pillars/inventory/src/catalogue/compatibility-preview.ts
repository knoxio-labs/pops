import { and, countDistinct, inArray, isNull } from 'drizzle-orm';

import { items } from '../db/schema.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { PersistedCatalogue } from './catalogue-types.js';

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
