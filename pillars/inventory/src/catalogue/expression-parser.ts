import { exactKeys, fail, primitive, record } from './expression-parse-shared.js';
import { ExpressionValidationError } from './expression-types.js';

import type { ExpressionV1 } from './expression-types.js';

const MAX_EXPRESSION_NODES = 128;
const MAX_REFERENCE_HOPS = 2;
const UNARY = ['negate', 'not'] as const;
const BINARY = [
  'add',
  'subtract',
  'multiply',
  'divide',
  'concat',
  'equal',
  'less_than',
  'and',
  'or',
] as const;
const UNARY_OPS: ReadonlySet<string> = new Set(UNARY);
const BINARY_OPS: ReadonlySet<string> = new Set(BINARY);

/**
 * Every node `op` expression versions 1 and 2 accept; clients must evaluate
 * each one. Version 3 adds {@link EXPRESSION_SERVER_ONLY_OPS}.
 */
export const EXPRESSION_V1_OPS: readonly ExpressionV1['op'][] = [
  'literal',
  'read',
  ...UNARY,
  ...BINARY,
  'if',
  'coalesce',
];

/** Ops only the server evaluates; a client keeps the server's value for a field using one. */
export const EXPRESSION_SERVER_ONLY_OPS: readonly ExpressionV1['op'][] = ['assembly_read'];

/** The first expression version whose grammar includes `assembly_read`. */
const ASSEMBLY_READ_VERSION = 3;

interface ParseState {
  nodes: number;
  readonly version: number;
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

function parseCoalesce(
  value: Record<string, unknown>,
  path: string,
  state: ParseState
): ExpressionV1 {
  exactKeys(value, ['op', 'values'], path);
  const values = value['values'];
  if (!Array.isArray(values) || values.length < 2)
    fail(`${path}.values`, 'expression_arity_invalid', 'coalesce needs at least two values');
  return {
    op: 'coalesce',
    values: values.map((entry, index) => parseNode(entry, `${path}.values.${index}`, state)),
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

function parseAssemblyRead(
  value: Record<string, unknown>,
  path: string,
  state: ParseState
): ExpressionV1 {
  if (state.version < ASSEMBLY_READ_VERSION)
    fail(`${path}.op`, 'expression_op_unknown', 'assembly_read needs expression version 3');
  exactKeys(value, ['fieldId', 'op'], path);
  if (typeof value['fieldId'] !== 'string' || value['fieldId'].length === 0)
    fail(`${path}.fieldId`, 'field_id_invalid', 'must be a non-empty string');
  return { op: 'assembly_read', fieldId: value['fieldId'] };
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
  if (op === 'assembly_read') return parseAssemblyRead(object, path, state);
  if (typeof op === 'string' && UNARY_OPS.has(op)) return parseUnary(op, object, path, state);
  if (typeof op === 'string' && BINARY_OPS.has(op)) return parseBinary(op, object, path, state);
  if (op === 'if') return parseConditional(object, path, state);
  if (op === 'coalesce') return parseCoalesce(object, path, state);
  return fail(`${path}.op`, 'expression_op_unknown', 'is not an expression operation');
}

/**
 * The expression versions this server stores. Version 2 derives and converts
 * measurement units and compares decimals by value (ADR-002 D5); version 3
 * keeps version 2's semantics and adds `assembly_read`, which only the server
 * evaluates. A client keeps the server's value for a version it does not
 * evaluate.
 */
export const EXPRESSION_VERSIONS: readonly number[] = [1, 2, 3];

/** Parses a supported expression version and enforces its structural resource bounds. */
export function parseExpression(version: number, value: unknown): ExpressionV1 {
  if (!EXPRESSION_VERSIONS.includes(version))
    throw new ExpressionValidationError(
      'expression_version_unknown',
      'expressionVersion',
      `unsupported expression version ${version}`
    );
  return parseNode(value, 'expression', { nodes: 0, version });
}
