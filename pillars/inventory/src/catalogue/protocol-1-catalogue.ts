/** The revision-1 persisted snapshot projected into the temporary protocol-1 descriptor. */
import { createHash } from 'node:crypto';

import {
  loadPublishedCatalogue,
  type PersistedItemType,
  type PersistedItemTypeField,
} from './catalogue.js';

import type { CommandDb } from '../db/command-db.js';

/** A unit carried by the unchanged protocol-1 catalogue descriptor. */
export interface Protocol1Unit {
  readonly symbol: string;
  readonly dimension:
    | 'length'
    | 'mass'
    | 'volume'
    | 'power'
    | 'voltage'
    | 'data-rate'
    | 'brightness'
    | 'colour-temperature';
  readonly multiplier: number;
}

/** One protocol-1 field declaration projected from a persisted field. */
export interface Protocol1CatalogueField {
  readonly key: string;
  readonly label: string;
  readonly kind: 'text' | 'choice' | 'flag' | 'measurement' | 'range' | 'link';
  readonly hint?: string;
  readonly choices?: string[];
  readonly dimension?: Protocol1Unit['dimension'];
  readonly unit?: string;
  readonly highlighted?: boolean;
  readonly required?: boolean;
}

/** One protocol-1 type declaration projected from a persisted type. */
export interface Protocol1CatalogueType {
  readonly key: string;
  readonly name: string;
  readonly capabilities: readonly 'containment'[];
  readonly fields: readonly Protocol1CatalogueField[];
  readonly legacyLabels: readonly string[];
}

/** The exact descriptor the protocol-1 `/types` route continues to serve. */
export interface Protocol1CatalogueDescriptor {
  readonly version: string;
  readonly units: readonly Protocol1Unit[];
  readonly types: readonly Protocol1CatalogueType[];
}

const UNITS: readonly Protocol1Unit[] = [
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
];

const UNITS_BY_SYMBOL = new Map(UNITS.map((unit) => [unit.symbol, unit]));

function presentationBoolean(field: PersistedItemTypeField, key: string): boolean | undefined {
  const value = field.presentation[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean')
    throw new Error(`field ${field.id} presentation ${key} must be boolean`);
  return value || undefined;
}

function baseField(field: PersistedItemTypeField): Omit<Protocol1CatalogueField, 'kind'> {
  const highlighted = presentationBoolean(field, 'highlighted');
  return {
    key: field.key,
    label: field.label,
    ...(field.help === null ? {} : { hint: field.help }),
    ...(highlighted === undefined ? {} : { highlighted }),
    ...(field.required ? { required: true } : {}),
  };
}

function measuredField(
  field: PersistedItemTypeField,
  kind: 'measurement' | 'range',
  key = field.key,
  label = field.label
): Protocol1CatalogueField {
  if (field.fixedUnit === null) throw new Error(`field ${field.id} must declare a fixed unit`);
  const unit = UNITS_BY_SYMBOL.get(field.fixedUnit);
  if (!unit)
    throw new Error(`field ${field.id} declares an unknown protocol-1 unit ${field.fixedUnit}`);
  return { ...baseField(field), key, label, kind, dimension: unit.dimension, unit: unit.symbol };
}

function projectField(field: PersistedItemTypeField): Protocol1CatalogueField {
  switch (field.kind) {
    case 'short_text':
      return { ...baseField(field), kind: 'text' };
    case 'url':
      return { ...baseField(field), kind: 'link' };
    case 'boolean':
      return { ...baseField(field), kind: 'flag' };
    case 'enum':
      return {
        ...baseField(field),
        kind: 'choice',
        choices: field.enumOptions.map((option) => option.label),
      };
    case 'measurement':
      return measuredField(field, 'measurement');
    default:
      throw new Error(`field ${field.id} (${field.kind}) has no protocol-1 representation`);
  }
}

function projectType(type: PersistedItemType): Protocol1CatalogueType {
  const minimum = type.fields.find((field) => field.key === 'Colour temperature minimum');
  const maximum = type.fields.find((field) => field.key === 'Colour temperature maximum');
  const fields = type.fields
    .filter((field) => field !== maximum)
    .map((field) => {
      if (field !== minimum) return projectField(field);
      if (!maximum) throw new Error(`type ${type.id} has an incomplete protocol-1 range`);
      if (field.fixedUnit !== maximum.fixedUnit)
        throw new Error(`type ${type.id} range units differ`);
      return measuredField(field, 'range', 'Colour temperature', 'Colour temperature');
    })
    .toSorted((left, right) => left.key.localeCompare(right.key));
  if (maximum && !minimum) throw new Error(`type ${type.id} has an incomplete protocol-1 range`);
  if (type.capabilities.some((capability) => capability !== 'containment')) {
    throw new Error(`type ${type.id} contains a capability protocol 1 cannot represent`);
  }
  const capabilities: 'containment'[] = [];
  if (type.capabilities.includes('containment')) capabilities.push('containment');
  return {
    key: type.key,
    name: type.label,
    capabilities,
    fields,
    legacyLabels: type.legacyLabels,
  };
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).toSorted(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function version(value: Omit<Protocol1CatalogueDescriptor, 'version'>): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

/**
 * Projects exactly persisted revision 1 to the previous catalogue descriptor.
 * Revision 1 is the only supported protocol-1 snapshot; later published
 * revisions intentionally require protocol 2.
 */
export function projectProtocol1Catalogue(db: CommandDb): Protocol1CatalogueDescriptor {
  const catalogue = loadPublishedCatalogue(db, 1);
  if (!catalogue) throw new Error('published catalogue revision 1 does not exist');
  const descriptor = {
    units: UNITS.toSorted((left, right) => left.symbol.localeCompare(right.symbol)),
    types: catalogue.types
      .map(projectType)
      .toSorted((left, right) => left.key.localeCompare(right.key)),
  };
  return { ...descriptor, version: version(descriptor) };
}
