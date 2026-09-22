/** Read-only projection from canonical persisted values to protocol 1. */
import { and, eq } from 'drizzle-orm';

import { itemFieldValues, items } from '../db/schema.js';
import { resolveProtocol1TypeById, type PersistedItemTypeField } from './catalogue.js';
import { protocol1RangeFields } from './protocol-1-range.js';
import {
  Protocol1ValueError,
  type Protocol1FieldValue,
  type Protocol1Fields,
} from './protocol-1-types.js';
import { parseCanonicalValue } from './value-dispatch.js';

import type { CommandDb } from '../db/command-db.js';

function objectValue(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function optionValue(value: unknown): value is { readonly optionId: string } {
  return objectValue(value) && typeof value['optionId'] === 'string';
}

function measurementValue(
  value: unknown
): value is { readonly amount: string; readonly unit: string } {
  return (
    objectValue(value) && typeof value['amount'] === 'string' && typeof value['unit'] === 'string'
  );
}

function projectValue(field: PersistedItemTypeField, valueJson: string): Protocol1FieldValue {
  const readable =
    field.kind === 'enum' ? { ...field, archivedEnumOptionIds: new Set<string>() } : field;
  const value = parseCanonicalValue(readable, valueJson).value;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (optionValue(value)) {
    const option = field.enumOptions.find((candidate) => candidate.id === value.optionId);
    if (!option) throw new Protocol1ValueError(field.key, 'contains an unknown enum option');
    return option.label;
  }
  if (measurementValue(value)) {
    const amount = Number(value.amount);
    if (!Number.isFinite(amount)) {
      throw new Protocol1ValueError(field.key, 'cannot be represented by protocol 1');
    }
    return { value: amount, unit: value.unit };
  }
  throw new Protocol1ValueError(field.key, `cannot be represented by protocol 1 (${field.kind})`);
}

function projectRange(
  fields: Record<string, Protocol1FieldValue>,
  type: Parameters<typeof protocol1RangeFields>[0]
): void {
  const range = protocol1RangeFields(type);
  if (!range) return;
  const low = fields[range.minimum.key];
  const high = fields[range.maximum.key];
  delete fields[range.minimum.key];
  delete fields[range.maximum.key];
  if (
    objectValue(low) &&
    objectValue(high) &&
    typeof low['value'] === 'number' &&
    typeof high['value'] === 'number' &&
    low['unit'] === high['unit'] &&
    typeof low['unit'] === 'string'
  ) {
    fields['Colour temperature'] = { low: low['value'], high: high['value'], unit: low['unit'] };
  }
}

/** Loads an item's stored values and projects revision 1 back to legacy protocol-1 fields. */
export function loadProtocol1Fields(db: CommandDb, itemId: string): Protocol1Fields {
  const item = db.select({ typeId: items.typeId }).from(items).where(eq(items.id, itemId)).get();
  if (!item?.typeId) return {};
  const type = resolveProtocol1TypeById(db, item.typeId);
  if (!type) throw new Protocol1ValueError('type', `does not exist: ${item.typeId}`);
  const rows = db
    .select()
    .from(itemFieldValues)
    .where(and(eq(itemFieldValues.itemId, itemId), eq(itemFieldValues.source, 'stored')))
    .all();
  const fields: Record<string, Protocol1FieldValue> = {};
  const definitions = new Map(type.fields.map((field) => [field.id, field]));
  for (const row of rows) {
    if (row.ordinal !== 0) {
      throw new Protocol1ValueError(row.fieldId, 'has cardinality unsupported by protocol 1');
    }
    const field = definitions.get(row.fieldId);
    if (field) fields[field.key] = projectValue(field, row.valueJson);
  }
  projectRange(fields, type);
  return fields;
}
