import { ExpressionValidationError } from './expression-types.js';

import type { ExpressionV1 } from './expression-types.js';
import type {
  EnumWireValue,
  MeasurementWireValue,
  PrimitiveWireValue,
  ReferenceWireValue,
} from './value-types.js';

const MAX_EXPRESSION_NODES = 128;
const MAX_REFERENCE_HOPS = 2;
const UNARY_OPS = new Set(['negate', 'not']);
const BINARY_OPS = new Set([
  'add',
  'subtract',
  'multiply',
  'divide',
  'concat',
  'equal',
  'less_than',
  'and',
  'or',
]);

interface ParseState {
  nodes: number;
}

function fail(path: string, code: string, message: string): never {
  throw new ExpressionValidationError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return fail(path, 'expression_node_invalid', 'must be an object');
  return value;
}

function exactKeys(
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

function primitive(value: unknown, path: string): PrimitiveWireValue {
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number' && Number.isSafeInteger(value)) return value;
  const object = record(value, path);
  const keys = Object.keys(object).toSorted();
  const parsed =
    enumLiteral(object, keys) ?? measurementLiteral(object, keys) ?? referenceLiteral(object, keys);
  if (parsed !== null) return parsed;
  return fail(path, 'literal_invalid', 'is not a primitive wire value');
}

function child(
  value: Record<string, unknown>,
  key: string,
  path: string,
  state: ParseState
): ExpressionV1 {
  return parseNode(value[key], `${path}.${key}`, state);
}

function parseUnary(
  op: string,
  value: Record<string, unknown>,
  path: string,
  state: ParseState
): ExpressionV1 {
  exactKeys(value, ['op', 'value'], path);
  const valueNode = child(value, 'value', path, state);
  return op === 'negate' ? { op, value: valueNode } : { op: 'not', value: valueNode };
}

function parseBinary(
  op: string,
  value: Record<string, unknown>,
  path: string,
  state: ParseState
): ExpressionV1 {
  exactKeys(value, ['left', 'op', 'right'], path);
  const left = child(value, 'left', path, state);
  const right = child(value, 'right', path, state);
  if (op === 'add' || op === 'subtract' || op === 'multiply' || op === 'divide')
    return { op, left, right };
  if (op === 'concat' || op === 'equal' || op === 'less_than') return { op, left, right };
  return op === 'and' ? { op, left, right } : { op: 'or', left, right };
}

function parseConditional(
  value: Record<string, unknown>,
  path: string,
  state: ParseState
): ExpressionV1 {
  exactKeys(value, ['condition', 'else', 'op', 'then'], path);
  return {
    op: 'if',
    condition: child(value, 'condition', path, state),
    thenBranch: child(value, 'then', path, state),
    elseBranch: child(value, 'else', path, state),
  };
}

function parseRead(value: Record<string, unknown>, path: string): ExpressionV1 {
  exactKeys(value, ['fieldId', 'op', 'path'], path);
  if (typeof value['fieldId'] !== 'string' || value['fieldId'].length === 0)
    fail(`${path}.fieldId`, 'field_id_invalid', 'must be a non-empty string');
  if (!Array.isArray(value['path']) || value['path'].some((part) => typeof part !== 'string'))
    fail(`${path}.path`, 'reference_path_invalid', 'must contain field ids');
  if (value['path'].length > MAX_REFERENCE_HOPS)
    fail(`${path}.path`, 'reference_hops_exceeded', 'may traverse at most two references');
  return { op: 'read', path: value['path'], fieldId: value['fieldId'] };
}

function parseNode(value: unknown, path: string, state: ParseState): ExpressionV1 {
  state.nodes += 1;
  if (state.nodes > MAX_EXPRESSION_NODES)
    fail(path, 'expression_nodes_exceeded', 'may contain at most 128 nodes');
  const object = record(value, path);
  const op = object['op'];
  if (op === 'literal') {
    exactKeys(object, ['op', 'value'], path);
    return { op, value: primitive(object['value'], `${path}.value`) };
  }
  if (op === 'read') return parseRead(object, path);
  if (typeof op === 'string' && UNARY_OPS.has(op)) return parseUnary(op, object, path, state);
  if (typeof op === 'string' && BINARY_OPS.has(op)) return parseBinary(op, object, path, state);
  if (op === 'if') return parseConditional(object, path, state);
  return fail(`${path}.op`, 'expression_op_unknown', 'is not an expression-v1 operation');
}

/** Parses only expression version 1 and enforces its structural resource bounds. */
export function parseExpression(version: number, value: unknown): ExpressionV1 {
  if (version !== 1)
    throw new ExpressionValidationError(
      'expression_version_unknown',
      'expressionVersion',
      `unsupported expression version ${version}`
    );
  return parseNode(value, 'expression', { nodes: 0 });
}
