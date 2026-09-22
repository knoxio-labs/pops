/** Validation of closed field-definition vocabularies loaded from SQLite. */
import { CatalogueDataError } from './catalogue-error.js';
import { parseStringArray } from './catalogue-json.js';

import type { FieldCardinality, FieldStorage, PrimitiveKind } from './value-codec.js';

const PRIMITIVE_KIND_SET: ReadonlySet<string> = new Set([
  'short_text',
  'long_text',
  'integer',
  'decimal',
  'boolean',
  'enum',
  'measurement',
  'date',
  'date_time',
  'url',
  'reference',
]);

/** Validates a stored primitive kind. */
export function asPrimitiveKind(value: string, fieldId: string): PrimitiveKind {
  if (!PRIMITIVE_KIND_SET.has(value))
    throw new CatalogueDataError(`field ${fieldId} declares unsupported kind ${value}`);
  return value as PrimitiveKind;
}

/** Validates a stored field cardinality. */
export function asCardinality(value: string, fieldId: string): FieldCardinality {
  if (value !== 'one' && value !== 'many')
    throw new CatalogueDataError(`field ${fieldId} declares unsupported cardinality ${value}`);
  return value;
}

/** Validates a stored field storage authority. */
export function asStorage(value: string, fieldId: string): FieldStorage {
  if (value !== 'stored' && value !== 'computed')
    throw new CatalogueDataError(`field ${fieldId} declares unsupported storage ${value}`);
  return value;
}

/** Validates a field's persisted reference target kinds. */
export function asReferenceKinds(value: string, fieldId: string): ReadonlySet<'item' | 'location'> {
  const kinds = parseStringArray(value, `field ${fieldId} reference kinds`);
  if (kinds.some((kind) => kind !== 'item' && kind !== 'location'))
    throw new CatalogueDataError(`field ${fieldId} declares an unsupported reference kind`);
  const narrowed: ('item' | 'location')[] = [];
  for (const kind of kinds) {
    if (kind === 'item' || kind === 'location') narrowed.push(kind);
  }
  return new Set(narrowed);
}
