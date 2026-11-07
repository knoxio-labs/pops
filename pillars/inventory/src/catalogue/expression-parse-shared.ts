import { ExpressionValidationError } from './expression-types.js';

import type {
  EnumWireValue,
  MeasurementWireValue,
  PrimitiveWireValue,
  ReferenceWireValue,
} from './value-types.js';

/** Raises a structural parse failure at `path`. */
export function fail(path: string, code: string, message: string): never {
  throw new ExpressionValidationError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** The node at `path` as an object, or a parse failure. */
export function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return fail(path, 'expression_node_invalid', 'must be an object');
  return value;
}

/** Fails unless the node carries exactly the `expected` keys, so no extra syntax rides along. */
export function exactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  path: string
): void {
  const actual = Object.keys(value).toSorted();
  const keys = [...expected].toSorted();
  if (actual.length !== keys.length || actual.some((key, index) => key !== keys[index]))
    fail(path, 'expression_node_invalid', `must have exactly: ${keys.join(', ')}`);
}

function enumLiteral(
  object: Record<string, unknown>,
  keys: readonly string[]
): EnumWireValue | null {
  if (keys.length === 1 && keys[0] === 'optionId' && typeof object['optionId'] === 'string')
    return { optionId: object['optionId'] };
  return null;
}

function measurementLiteral(
  object: Record<string, unknown>,
  keys: readonly string[]
): MeasurementWireValue | null {
  if (
    keys.length === 2 &&
    keys[0] === 'amount' &&
    keys[1] === 'unit' &&
    typeof object['amount'] === 'string' &&
    typeof object['unit'] === 'string'
  )
    return { amount: object['amount'], unit: object['unit'] };
  return null;
}

function referenceLiteral(
  object: Record<string, unknown>,
  keys: readonly string[]
): ReferenceWireValue | null {
  if (
    keys.length === 2 &&
    keys[0] === 'targetId' &&
    keys[1] === 'targetKind' &&
    typeof object['targetId'] === 'string' &&
    (object['targetKind'] === 'item' || object['targetKind'] === 'location')
  )
    return { targetId: object['targetId'], targetKind: object['targetKind'] };
  return null;
}

/** A canonical primitive wire literal, or a parse failure. */
export function primitive(value: unknown, path: string): PrimitiveWireValue {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  const object = record(value, path);
  const keys = Object.keys(object).toSorted();
  const parsed =
    enumLiteral(object, keys) ?? measurementLiteral(object, keys) ?? referenceLiteral(object, keys);
  if (parsed !== null) return parsed;
  return fail(path, 'literal_invalid', 'is not a primitive wire value');
}
