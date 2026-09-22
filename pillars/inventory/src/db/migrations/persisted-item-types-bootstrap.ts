import { createHash } from 'node:crypto';

import { z } from 'zod';

import { exactLegacyMeasurement, exactLegacyRangePart } from './persisted-item-types-conversion.js';
import { validateSeedIdentities } from './persisted-item-types-identity.js';

import type Database from 'better-sqlite3';

const EXPECTED_DESCRIPTOR_VERSION =
  '20607ed5a88225f408a28436a550ac32b3d24de8d7e51bdcc001dc874b4027c3';

const seedOptionSchema = z.object({ id: z.string().uuid(), key: z.string(), label: z.string() });
const seedFieldSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  kind: z.enum(['short_text', 'enum', 'boolean', 'measurement']),
  fixedUnit: z.string().nullable(),
  help: z.string().nullable(),
  presentation: z.object({ highlighted: z.boolean() }),
  options: z.array(seedOptionSchema),
});
const seedTypeSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  label: z.string(),
  capabilities: z.array(z.literal('containment')),
  legacyLabels: z.array(z.string()),
  fields: z.array(seedFieldSchema),
});
const seedCatalogueSchema = z.array(seedTypeSchema);

const UNITS = [
  { symbol: 'mm', dimension: 'length', multiplier: 0.001 },
  { symbol: 'cm', dimension: 'length', multiplier: 0.01 },
  { symbol: 'm', dimension: 'length', multiplier: 1 },
  { symbol: 'kg', dimension: 'mass', multiplier: 1 },
  { symbol: 'L', dimension: 'volume', multiplier: 1 },
  { symbol: 'W', dimension: 'power', multiplier: 1 },
  { symbol: 'V', dimension: 'voltage', multiplier: 1 },
  { symbol: 'Gbps', dimension: 'data-rate', multiplier: 1 },
  { symbol: 'lm', dimension: 'brightness', multiplier: 1 },
  { symbol: 'K', dimension: 'colour-temperature', multiplier: 1 },
] as const;

type ProjectedSeedField = {
  readonly key: string;
  readonly label: string;
  readonly hint?: string;
  readonly highlighted?: boolean;
} & (
  | { readonly kind: 'text' | 'flag' }
  | { readonly kind: 'choice'; readonly choices: readonly string[] }
  | {
      readonly kind: 'measurement';
      readonly dimension: (typeof UNITS)[number]['dimension'];
      readonly unit: string;
    }
);

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function dimensionForUnit(unit: string): (typeof UNITS)[number]['dimension'] {
  const definition = UNITS.find((candidate) => candidate.symbol === unit);
  if (!definition) throw new Error(`bootstrap field declares unknown unit ${unit}`);
  return definition.dimension;
}

function projectSeedField(field: z.infer<typeof seedFieldSchema>): ProjectedSeedField {
  const base = {
    key: field.key,
    label: field.label,
    ...(field.help === null ? {} : { hint: field.help }),
    ...(field.presentation.highlighted ? { highlighted: true } : {}),
  };
  switch (field.kind) {
    case 'short_text':
      return { ...base, kind: 'text' as const };
    case 'boolean':
      return { ...base, kind: 'flag' as const };
    case 'enum':
      return { ...base, kind: 'choice' as const, choices: field.options.map(({ label }) => label) };
    case 'measurement': {
      if (field.fixedUnit === null) throw new Error(`bootstrap field ${field.key} has no unit`);
      return {
        ...base,
        kind: 'measurement' as const,
        dimension: dimensionForUnit(field.fixedUnit),
        unit: field.fixedUnit,
      };
    }
  }
}

function descriptorVersion(seed: string): string {
  const catalogue = seedCatalogueSchema.parse(JSON.parse(seed));
  validateSeedIdentities(catalogue);
  const types = catalogue.map((type) => {
    const minimum = type.fields.find((field) => field.key === 'Colour temperature minimum');
    const maximum = type.fields.find((field) => field.key === 'Colour temperature maximum');
    const fields = type.fields
      .filter((field) => field !== maximum)
      .map((field) => {
        if (field !== minimum) return projectSeedField(field);
        if (!maximum || field.fixedUnit === null || field.fixedUnit !== maximum.fixedUnit) {
          throw new Error(`bootstrap type ${type.key} has an invalid split range`);
        }
        return {
          key: 'Colour temperature',
          label: 'Colour temperature',
          kind: 'range' as const,
          dimension: dimensionForUnit(field.fixedUnit),
          unit: field.fixedUnit,
        };
      })
      .toSorted((left, right) => left.key.localeCompare(right.key));
    if (maximum && !minimum) throw new Error(`bootstrap type ${type.key} has an incomplete range`);
    return {
      key: type.key,
      name: type.label,
      capabilities: type.capabilities,
      fields,
      legacyLabels: type.legacyLabels,
    };
  });
  const descriptor = {
    units: UNITS.toSorted((left, right) => left.symbol.localeCompare(right.symbol)),
    types: types.toSorted((left, right) => left.key.localeCompare(right.key)),
  };
  return createHash('sha256').update(canonicalJson(descriptor)).digest('hex');
}

/** Returns one only when a bootstrap seed has the exact revision-1 descriptor and identities. */
export function persistedItemTypesSeedParity(seed: string): number {
  return descriptorVersion(seed) === EXPECTED_DESCRIPTOR_VERSION ? 1 : 0;
}

/** Registers deterministic functions required only while migration 0017 is applied. */
export function registerPersistedItemTypesMigrationFunctions(raw: Database.Database): void {
  raw.function('inventory_catalogue_seed_parity', { deterministic: true }, (seed: string) => {
    return persistedItemTypesSeedParity(seed);
  });
  raw.function(
    'inventory_migrate_measurement_value',
    { deterministic: true },
    exactLegacyMeasurement
  );
  raw.function('inventory_migrate_range_value', { deterministic: true }, exactLegacyRangePart);
}
