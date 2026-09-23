type Parsed<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; error: string };

/** A JSON value accepted by the inventory producer's canonical value codec. */
export type ItemJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly ItemJsonValue[]
  | { readonly [key: string]: ItemJsonValue };

/** One complete stored value group for create and change-type mutations. */
export interface StoredFieldValueInput {
  readonly fieldId: string;
  readonly values: readonly ItemJsonValue[];
}

/** One stored-value edit; `null` clears an optional value group. */
export interface FieldValuePatchInput {
  readonly fieldId: string;
  readonly values: readonly ItemJsonValue[] | null;
}

/** One complete value group accepted by the non-mutating validator. */
export interface ValidationFieldValueInput {
  readonly fieldId: string;
  readonly source: 'stored' | 'override';
  readonly values: readonly ItemJsonValue[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

const fieldIdProperty = { type: 'string', format: 'uuid' } as const;
const jsonValuesProperty = { type: 'array', minItems: 1, items: {} } as const;

/** MCP schema for a complete stored field-value group. */
export const storedFieldValueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: { fieldId: fieldIdProperty, values: jsonValuesProperty },
  required: ['fieldId', 'values'],
} as const;

/** MCP schema for a stored field-value patch, including explicit clear. */
export const fieldValuePatchSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fieldId: fieldIdProperty,
    values: { oneOf: [jsonValuesProperty, { type: 'null' }] },
  },
  required: ['fieldId', 'values'],
} as const;

/** MCP schema for a complete field-value group sent to authoritative validation. */
export const validationFieldValueSchema = {
  type: 'object',
  additionalProperties: false,
  properties: {
    fieldId: fieldIdProperty,
    source: { type: 'string', enum: ['stored', 'override'] },
    values: jsonValuesProperty,
  },
  required: ['fieldId', 'source', 'values'],
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is ItemJsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(isJsonValue);
  return isRecord(value) && Object.values(value).every(isJsonValue);
}

function fieldId(entry: Record<string, unknown>, index: number): Parsed<string> {
  const value = entry['fieldId'];
  if (typeof value !== 'string' || !UUID.test(value)) {
    return { ok: false, error: `Invalid fieldValues[${String(index)}].fieldId` };
  }
  return { ok: true, value };
}

function jsonValues(value: unknown, index: number): Parsed<readonly ItemJsonValue[]> {
  if (!Array.isArray(value) || value.length === 0 || !value.every(isJsonValue)) {
    return { ok: false, error: `Invalid fieldValues[${String(index)}].values` };
  }
  return { ok: true, value };
}

function fieldValueArray(
  args: Record<string, unknown>
): Parsed<readonly Record<string, unknown>[]> {
  const value = args['fieldValues'];
  if (!Array.isArray(value) || !value.every(isRecord)) {
    return { ok: false, error: 'Missing or invalid required field: fieldValues' };
  }
  return { ok: true, value };
}

/** Parses the complete stored values required by create and change-type. */
export function requiredStoredFieldValues(
  args: Record<string, unknown>
): Parsed<readonly StoredFieldValueInput[]> {
  const entries = fieldValueArray(args);
  if (!entries.ok) return entries;
  const parsed: StoredFieldValueInput[] = [];
  for (const [index, entry] of entries.value.entries()) {
    const id = fieldId(entry, index);
    if (!id.ok) return id;
    const values = jsonValues(entry['values'], index);
    if (!values.ok) return values;
    parsed.push({ fieldId: id.value, values: values.value });
  }
  return { ok: true, value: parsed };
}

/** Parses an optional field-value patch, preserving explicit `null` clears. */
export function optionalFieldValuePatches(
  args: Record<string, unknown>
): Parsed<readonly FieldValuePatchInput[] | undefined> {
  if (args['fieldValues'] === undefined) return { ok: true, value: undefined };
  const entries = fieldValueArray(args);
  if (!entries.ok) return entries;
  const parsed: FieldValuePatchInput[] = [];
  for (const [index, entry] of entries.value.entries()) {
    const id = fieldId(entry, index);
    if (!id.ok) return id;
    if (entry['values'] === null) {
      parsed.push({ fieldId: id.value, values: null });
      continue;
    }
    const values = jsonValues(entry['values'], index);
    if (!values.ok) return values;
    parsed.push({ fieldId: id.value, values: values.value });
  }
  return { ok: true, value: parsed };
}

/** Parses the complete source-tagged values required by non-mutating validation. */
export function requiredValidationFieldValues(
  args: Record<string, unknown>
): Parsed<readonly ValidationFieldValueInput[]> {
  const entries = fieldValueArray(args);
  if (!entries.ok) return entries;
  const parsed: ValidationFieldValueInput[] = [];
  for (const [index, entry] of entries.value.entries()) {
    const id = fieldId(entry, index);
    if (!id.ok) return id;
    const source = entry['source'];
    if (source !== 'stored' && source !== 'override') {
      return { ok: false, error: `Invalid fieldValues[${String(index)}].source` };
    }
    const values = jsonValues(entry['values'], index);
    if (!values.ok) return values;
    parsed.push({ fieldId: id.value, source, values: values.value });
  }
  return { ok: true, value: parsed };
}

/** Parses an optional UUID, used for retry-stable mutation and entity identities. */
export function optionalUuid(
  args: Record<string, unknown>,
  key: string
): Parsed<string | undefined> {
  const value = args[key];
  if (value === undefined) return { ok: true, value: undefined };
  if (typeof value !== 'string' || !UUID.test(value)) {
    return { ok: false, error: `Invalid field: ${key}` };
  }
  return { ok: true, value };
}

/** Parses a required UUID. */
export function requiredUuid(args: Record<string, unknown>, key: string): Parsed<string> {
  const value = optionalUuid(args, key);
  if (!value.ok) return value;
  if (value.value === undefined) {
    return { ok: false, error: `Missing or invalid required field: ${key}` };
  }
  return { ok: true, value: value.value };
}
