/** Temporary protocol-1 conversion and persistence for revision-1 values. */
import { and, eq } from 'drizzle-orm';

import { itemFieldValues } from '../db/schema.js';
import {
  loadPublishedCatalogue,
  resolveProtocol1TypeById,
  type PersistedItemType,
  type PersistedItemTypeField,
} from './catalogue.js';
import { convertProtocol1MeasurementAmount } from './protocol-1-measurement.js';
import { protocol1RangeFields } from './protocol-1-range.js';
import { loadProtocol1Fields } from './protocol-1-read.js';
import { Protocol1ValueError, type CanonicalItemFieldValues } from './protocol-1-types.js';
import { canonicalizeValue, type CanonicalValue } from './value-codec.js';

import type { CommandDb } from '../domain/commands/entities.js';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function protocol1Measurement(field: PersistedItemTypeField, value: unknown): CanonicalValue {
  if (!isRecord(value) || typeof value['unit'] !== 'string' || typeof value['value'] !== 'number') {
    throw new Protocol1ValueError(field.key, 'must be a measurement object');
  }
  const unit = field.fixedUnit;
  if (unit === null) throw new Protocol1ValueError(field.key, 'has no fixed unit');
  return canonicalizeValue(field, {
    amount: convertProtocol1MeasurementAmount(field.key, value['value'], value['unit'], unit),
    unit,
  });
}

function protocol1Enum(field: PersistedItemTypeField, value: unknown): CanonicalValue {
  if (typeof value !== 'string') throw new Protocol1ValueError(field.key, 'must be an enum label');
  const option = field.enumOptions.find((candidate) => candidate.label === value);
  if (!option) throw new Protocol1ValueError(field.key, `does not declare option ${value}`);
  return canonicalizeValue(field, { optionId: option.id });
}

function protocol1CanonicalValue(field: PersistedItemTypeField, value: unknown): CanonicalValue {
  switch (field.kind) {
    case 'short_text':
    case 'url':
    case 'boolean':
      return canonicalizeValue(field, value);
    case 'enum':
      return protocol1Enum(field, value);
    case 'measurement':
      return protocol1Measurement(field, value);
    default:
      throw new Protocol1ValueError(
        field.key,
        `cannot be represented by protocol 1 (${field.kind})`
      );
  }
}

function protocol1Range(
  type: PersistedItemType,
  value: unknown
): readonly CanonicalItemFieldValues[] {
  if (
    !isRecord(value) ||
    typeof value['unit'] !== 'string' ||
    typeof value['low'] !== 'number' ||
    typeof value['high'] !== 'number'
  ) {
    throw new Protocol1ValueError('Colour temperature', 'must be a range object');
  }
  const fields = protocol1RangeFields(type);
  if (!fields) throw new Protocol1ValueError('Colour temperature', 'is not declared by this type');
  return [
    {
      fieldId: fields.minimum.id,
      source: 'stored',
      values: [protocol1Measurement(fields.minimum, { value: value['low'], unit: value['unit'] })],
    },
    {
      fieldId: fields.maximum.id,
      source: 'stored',
      values: [protocol1Measurement(fields.maximum, { value: value['high'], unit: value['unit'] })],
    },
  ];
}

function canonicalizeProtocol1Fields(
  type: PersistedItemType,
  fields: Readonly<Record<string, unknown>>
): readonly CanonicalItemFieldValues[] {
  const values: CanonicalItemFieldValues[] = [];
  for (const [key, value] of Object.entries(fields)) {
    if (key === 'Colour temperature') {
      values.push(...protocol1Range(type, value));
      continue;
    }
    const field = type.fields.find((candidate) => candidate.key === key);
    if (!field) throw new Protocol1ValueError(key, 'is not declared by this type');
    values.push({
      fieldId: field.id,
      source: 'stored',
      values: [protocol1CanonicalValue(field, value)],
    });
  }
  return values;
}

/** Validates protocol-1 fields into stable-ID, canonical persisted values without writing them. */
export function validateProtocol1Fields(
  db: CommandDb,
  input: { readonly typeId: string; readonly fields: Readonly<Record<string, unknown>> }
): readonly CanonicalItemFieldValues[] {
  const type = resolveProtocol1TypeById(db, input.typeId);
  if (!type) throw new Protocol1ValueError('type', `does not exist: ${input.typeId}`);
  return canonicalizeProtocol1Fields(type, input.fields);
}

function exactType(db: CommandDb, typeId: string, revision: number): PersistedItemType {
  const type = loadPublishedCatalogue(db, revision)?.types.find(
    (candidate) => candidate.id === typeId
  );
  if (!type)
    throw new Protocol1ValueError('type', `does not exist in published revision ${revision}`);
  return type;
}

function insertValues(
  db: CommandDb,
  input: { readonly itemId: string; readonly revision: number; readonly now: string },
  values: readonly CanonicalItemFieldValues[]
): void {
  for (const field of values) {
    for (const [ordinal, value] of field.values.entries()) {
      db.insert(itemFieldValues)
        .values({
          itemId: input.itemId,
          fieldId: field.fieldId,
          source: field.source,
          ordinal,
          valueJson: value.valueJson,
          catalogueRevision: input.revision,
          createdAt: input.now,
          updatedAt: input.now,
        })
        .run();
    }
  }
}

/** Replaces stored protocol-1 values in one transaction while preserving overrides. */
export function replaceItemFieldValues(
  db: CommandDb,
  input: {
    readonly itemId: string;
    readonly typeId: string;
    readonly fields: Readonly<Record<string, unknown>>;
    readonly catalogueRevision: number;
    readonly now: string;
  }
): readonly CanonicalItemFieldValues[] {
  const type = exactType(db, input.typeId, input.catalogueRevision);
  const values = canonicalizeProtocol1Fields(type, input.fields);
  return db.transaction((tx) => {
    tx.delete(itemFieldValues)
      .where(and(eq(itemFieldValues.itemId, input.itemId), eq(itemFieldValues.source, 'stored')))
      .run();
    insertValues(
      tx,
      { itemId: input.itemId, revision: input.catalogueRevision, now: input.now },
      values
    );
    return values;
  });
}

/**
 * Applies a protocol-1 per-key patch to an item's stored values atomically.
 * `null` removes the named field; every other value replaces that field after
 * the complete resulting blob is validated against the exact revision.
 */
export function patchItemFieldValues(
  db: CommandDb,
  input: {
    readonly itemId: string;
    readonly typeId: string;
    readonly fields: Readonly<Record<string, unknown | null>>;
    readonly catalogueRevision: number;
    readonly now: string;
  }
): readonly CanonicalItemFieldValues[] {
  const current: Record<string, unknown> = { ...loadProtocol1Fields(db, input.itemId) };
  for (const [key, value] of Object.entries(input.fields)) {
    if (value === null) delete current[key];
    else current[key] = value;
  }
  return replaceItemFieldValues(db, { ...input, fields: current });
}
