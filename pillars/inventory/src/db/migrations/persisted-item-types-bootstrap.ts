import { createHash } from 'node:crypto';

import { z } from 'zod';

import { exactLegacyMeasurement, exactLegacyRangePart } from './persisted-item-types-conversion.js';

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
const UUID_URL_NAMESPACE = '6ba7b8119dad11d180b400c04fd430c8';

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

function percentEncodedSegment(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/gu, (character) => {
    return `%${character.codePointAt(0)?.toString(16).toUpperCase().padStart(2, '0')}`;
  });
}

function uuidV5(name: string): string {
  const namespace = Buffer.from(UUID_URL_NAMESPACE, 'hex');
  const bytes = createHash('sha1').update(namespace).update(name, 'utf8').digest().subarray(0, 16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x50;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function derivedOptionKey(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/gu, '_');
}

function validateOptionIdentities(
  typeKey: string,
  fieldKey: string,
  fieldName: string,
  options: readonly z.infer<typeof seedOptionSchema>[]
): void {
  const optionKeys = new Set<string>();
  for (const option of options) {
    if (option.key !== derivedOptionKey(option.label) || optionKeys.has(option.key)) {
      throw new Error(`bootstrap field ${typeKey}.${fieldKey} has invalid option keys`);
    }
    optionKeys.add(option.key);
    const optionName = `${fieldName}/option/${percentEncodedSegment(option.key)}`;
    if (option.id !== uuidV5(optionName)) {
      throw new Error(`bootstrap option ${typeKey}.${fieldKey}.${option.key} has an invalid id`);
    }
  }
}

function validateFieldIdentity(
  typeKey: string,
  typeName: string,
  field: z.infer<typeof seedFieldSchema>
): void {
  const fieldName = `${typeName}/field/${percentEncodedSegment(field.key)}`;
  if (field.id !== uuidV5(fieldName)) {
    throw new Error(`bootstrap field ${typeKey}.${field.key} has an invalid id`);
  }
  validateOptionIdentities(typeKey, field.key, fieldName, field.options);
}

function validateSeedIdentities(catalogue: z.infer<typeof seedCatalogueSchema>): void {
  for (const type of catalogue) {
    const typeName = `pops://inventory/type/${percentEncodedSegment(type.key)}`;
    if (type.id !== uuidV5(typeName))
      throw new Error(`bootstrap type ${type.key} has an invalid id`);
    for (const field of type.fields) validateFieldIdentity(type.key, typeName, field);
  }
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
