import type { CallResult } from '@pops/pillar-sdk/client';

/** ADR-012 object types supported by the Ego gateway. */
export type ObjectUriType =
  | 'finance/transaction'
  | 'finance/account'
  | 'finance/budget'
  | 'media/movie'
  | 'media/tv-show'
  | 'inventory/item'
  | 'inventory/location'
  | 'purchases/purchase'
  | 'cerebrum/engram';

/** A JSON-like row that can be augmented with an object URI. */
export type Row = Record<string, unknown>;

/** Format an ADR-012 object URI from a supported type and its identifier. */
export function objectUri(type: ObjectUriType, id: string | number): string {
  if (typeof id === 'string' && id.length === 0) {
    throw new Error('Object URI id must not be empty.');
  }
  return `pops:${type}/${id}`;
}

/**
 * Transform object rows at the root or under one response envelope key.
 * Non-ok results and values without a plain-object target are returned as-is.
 */
export function mapRows<T>(
  result: CallResult<T>,
  at: string | null,
  transform: (row: Row) => Row
): CallResult<unknown> {
  if (result.kind !== 'ok') return result;

  const value = result.value;
  if (at === null) {
    if (!isPlainObject(value)) return result;
    return { ...result, value: transform(cloneRow(value)) };
  }

  if (!isPlainObject(value) || !Object.hasOwn(value, at)) return result;
  const target = value[at];
  if (Array.isArray(target)) {
    const rows = target.map((entry: unknown) =>
      isPlainObject(entry) ? transform(cloneRow(entry)) : entry
    );
    return { ...result, value: { ...value, [at]: rows } };
  }
  if (isPlainObject(target)) {
    return { ...result, value: { ...value, [at]: transform(cloneRow(target)) } };
  }
  return result;
}

/** Return a transform that adds the matching ADR-012 URI to rows with a valid id. */
export function withUri(type: ObjectUriType): (row: Row) => Row {
  return (row) => {
    const id = row['id'];
    if (typeof id === 'string' && id.length > 0) {
      return { ...row, uri: objectUri(type, id) };
    }
    if (typeof id === 'number' && Number.isInteger(id)) {
      return { ...row, uri: objectUri(type, id) };
    }
    return row;
  };
}

function isPlainObject(value: unknown): value is Row {
  if (typeof value !== 'object' || value === null) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function cloneRow(row: Row): Row {
  const clone: Row = {};
  for (const [key, value] of Object.entries(row)) clone[key] = clonePlainValue(value);
  return clone;
}

function clonePlainValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(clonePlainValue);
  return isPlainObject(value) ? cloneRow(value) : value;
}
