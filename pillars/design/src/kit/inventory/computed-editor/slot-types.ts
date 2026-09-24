import { resolveRead } from './catalogue-lookup';
import { combineUnits, formatUnitTerm } from './measurement-units';
import { ROOT_PATH, nodeChildren } from './tree';

import type { ExpressionContext, ExpressionNode, LiteralValue, ValueType } from './model';

const BOOLEAN: ValueType = { kind: 'boolean' };
const DECIMAL: ValueType = { kind: 'decimal' };
/** A measurement of any unit: the slot takes a decimal or any measurement, and combines with it. */
const MEASUREMENT_ANY: ValueType = { kind: 'measurement' };

function literalType(value: LiteralValue): ValueType {
  if (typeof value === 'boolean') return BOOLEAN;
  if (typeof value === 'number') return { kind: 'integer' };
  if (typeof value === 'string')
    return /^-?\d+(\.\d+)?$/u.test(value) ? DECIMAL : { kind: 'short_text' };
  if ('amount' in value) return { kind: 'measurement', unit: value.unit };
  return { kind: 'enum' };
}

function isMeasurement(type: ValueType | undefined): type is { kind: 'measurement'; unit: string } {
  return type?.kind === 'measurement' && type.unit !== undefined;
}

function isProduct(
  node: ExpressionNode
): node is { op: 'multiply' | 'divide'; left: ExpressionNode; right: ExpressionNode } {
  return node.op === 'multiply' || node.op === 'divide';
}

/**
 * The type a node carries on its own, inferred bottom-up: a read or literal's
 * type, or, for a chain of measurement products and quotients (Inventory
 * ADR-002 D5), the unit the combination derives. `undefined` for anything
 * else, which falls back to the top-down `expected` type.
 */
function ownType(context: ExpressionContext, node: ExpressionNode): ValueType | undefined {
  if (node.op === 'read') {
    const { field } = resolveRead(context, node);
    return field.unit === undefined ? { kind: field.kind } : { kind: field.kind, unit: field.unit };
  }
  if (node.op === 'literal') return literalType(node.value);
  if (isProduct(node)) {
    const left = ownType(context, node.left);
    if (!isMeasurement(left)) return undefined;
    const right = ownType(context, node.right);
    if (!isMeasurement(right)) return left;
    const combined = combineUnits(left.unit, right.unit, node.op === 'divide' ? -1 : 1);
    if (combined === null) return undefined;
    if (combined.term.length === 0) return DECIMAL;
    return { kind: 'measurement', unit: formatUnitTerm(combined.term) };
  }
  return undefined;
}

/**
 * The two slot types of a measurement product or quotient: each side that
 * already resolves to a measurement keeps its own unit; a side that does not
 * yet opens to a decimal or any measurement (Inventory ADR-002 D5), and
 * `undefined` when neither side is a measurement yet, deferring to the
 * caller's own guess.
 */
function derivedTypes(
  context: ExpressionContext,
  node: ExpressionNode
): readonly [ValueType, ValueType] | undefined {
  if (!isProduct(node)) return undefined;
  const left = ownType(context, node.left);
  const right = ownType(context, node.right);
  if (!isMeasurement(left) && !isMeasurement(right)) return undefined;
  return [
    isMeasurement(left) ? left : MEASUREMENT_ANY,
    isMeasurement(right) ? right : MEASUREMENT_ANY,
  ];
}

/** A measurement product or quotient's derived types, or the old scalar fallback. */
function multiplyDivideTypes(
  context: ExpressionContext,
  node: ExpressionNode,
  expected: ValueType
): readonly [ValueType, ValueType] {
  const derived = derivedTypes(context, node);
  if (derived !== undefined) return derived;
  const fallback = expected.kind === 'measurement' ? DECIMAL : expected;
  return [expected, fallback];
}

function childTypes(
  context: ExpressionContext,
  node: ExpressionNode,
  expected: ValueType
): readonly (ValueType | undefined)[] {
  switch (node.op) {
    case 'not':
    case 'and':
    case 'or':
      return [BOOLEAN, BOOLEAN];
    case 'if':
      return [BOOLEAN, expected, expected];
    case 'equal':
    case 'less_than': {
      const left = ownType(context, node.left) ?? ownType(context, node.right);
      return [left, left];
    }
    case 'multiply':
    case 'divide':
      return multiplyDivideTypes(context, node, expected);
    case 'coalesce':
      return node.args.map(() => expected);
    default:
      return [expected, expected];
  }
}

/**
 * The type every slot in the tree must produce, keyed by issue path. Mirrors
 * the server's rules: both sides of a comparison share the known operand's
 * type; a measurement times or divided by another measurement derives the
 * product's unit (Inventory ADR-002 D5), otherwise the other side is a plain
 * decimal; and every input of `if` and `coalesce` returns the field's own type.
 */
export function slotTypes(
  context: ExpressionContext,
  root: ExpressionNode,
  fieldType: ValueType
): ReadonlyMap<string, ValueType | undefined> {
  const types = new Map<string, ValueType | undefined>();
  const visit = (node: ExpressionNode, path: string, expected: ValueType | undefined) => {
    types.set(path, expected);
    const children = nodeChildren(node);
    const expectations = expected === undefined ? [] : childTypes(context, node, expected);
    children.forEach((child, index) => {
      visit(child.node, `${path}.${child.segment}`, expectations[index]);
    });
  };
  visit(root, ROOT_PATH, fieldType);
  return types;
}
