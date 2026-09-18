/**
 * The catalogue descriptor: the projection of `catalogue.ts` served to
 * clients (`GET /types`, added in A5) and committed as `types.snapshot.json`
 * so a breaking change to a shipped type is caught in review rather than on
 * a phone that already downloaded the old shape.
 */
import { createHash } from 'node:crypto';

import { hasMigration, type TypeMigrationRecord } from './type-migrations.js';
import { UNITS, type UnitDefinition } from './units.js';

import type { TypeDefinition } from './define-type.js';

export interface CatalogueDescriptor {
  /** A content hash of `units` and `types`; changes whenever either does. */
  readonly version: string;
  readonly units: readonly UnitDefinition[];
  readonly types: readonly TypeDefinition[];
}

/**
 * Projects `types` (and the fixed unit table) into the descriptor served to
 * clients, with a `version` that is a hash of the projection's content —
 * stable under key reordering, so two logically identical catalogues never
 * disagree on their version because of declaration order.
 */
export function projectCatalogue(
  types: readonly TypeDefinition[],
  units: readonly UnitDefinition[] = UNITS
): CatalogueDescriptor {
  const sortedUnits = units.toSorted((a, b) => a.symbol.localeCompare(b.symbol));
  const sortedTypes = types
    .map((type) => ({
      ...type,
      fields: type.fields.toSorted((a, b) => a.key.localeCompare(b.key)),
    }))
    .toSorted((a, b) => a.key.localeCompare(b.key));
  const version = hashCanonical({ units: sortedUnits, types: sortedTypes });
  return { version, units: sortedUnits, types: sortedTypes };
}

function hashCanonical(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/** `JSON.stringify` with every object's keys sorted, recursively, so key order never affects the result. */
function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).toSorted(([a], [b]) =>
      a.localeCompare(b)
    );
    return `{${entries.map(([key, entryValue]) => `${JSON.stringify(key)}:${canonicalJson(entryValue)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

/** One way `next` broke compatibility with `previous`, for a type with no registered migration. */
export interface CatalogueIncompatibility {
  readonly typeKey: string;
  readonly reason: string;
}

/**
 * Compares `previous` against `next` and returns every breaking change that
 * has no registered migration: a type or field removed, a choice dropped
 * from a `choice` field, a field's kind changed, or a `measurement`/`range`
 * field's dimension changed. Adding a type, a field or a choice is never breaking. Empty means
 * `next` is safe to ship as-is.
 */
export function findIncompatibilities(
  previous: CatalogueDescriptor,
  next: CatalogueDescriptor,
  migrations: readonly TypeMigrationRecord[]
): CatalogueIncompatibility[] {
  const incompatibilities: CatalogueIncompatibility[] = [];
  for (const previousType of previous.types) {
    const nextType = next.types.find((type) => type.key === previousType.key);
    if (!nextType) {
      if (!hasMigration(previousType.key, migrations)) {
        incompatibilities.push({
          typeKey: previousType.key,
          reason: `type "${previousType.key}" was removed`,
        });
      }
      continue;
    }
    if (hasMigration(previousType.key, migrations)) {
      continue;
    }
    for (const previousField of previousType.fields) {
      const nextField = nextType.fields.find((field) => field.key === previousField.key);
      incompatibilities.push(...fieldIncompatibilities(previousType.key, previousField, nextField));
    }
  }
  return incompatibilities;
}

type FieldDescriptor = TypeDefinition['fields'][number];

function fieldIncompatibilities(
  typeKey: string,
  previousField: FieldDescriptor,
  nextField: FieldDescriptor | undefined
): CatalogueIncompatibility[] {
  const key = previousField.key;
  if (!nextField) {
    return [{ typeKey, reason: `field "${key}" was removed` }];
  }
  if (previousField.kind !== nextField.kind) {
    return [
      {
        typeKey,
        reason: `field "${key}" changed kind from "${previousField.kind}" to "${nextField.kind}"`,
      },
    ];
  }
  const found: CatalogueIncompatibility[] = [];
  if ((previousField.dimension ?? null) !== (nextField.dimension ?? null)) {
    found.push({
      typeKey,
      reason: `field "${key}" changed dimension from "${previousField.dimension}" to "${nextField.dimension}"`,
    });
  }
  const droppedChoices = (previousField.choices ?? []).filter(
    (choice) => !(nextField.choices ?? []).includes(choice)
  );
  if (droppedChoices.length > 0) {
    found.push({
      typeKey,
      reason: `field "${key}" dropped choice(s): ${droppedChoices.join(', ')}`,
    });
  }
  return found;
}
