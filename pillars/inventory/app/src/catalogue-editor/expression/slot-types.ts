import { combineUnits, formatUnitTerm, sameDimension, unitDimension } from '@pops/inventory';

import { resolveRead } from './catalogue-lookup';
import { isNumericKind } from './model';
import { ROOT_PATH, nodeChildren } from './tree';

import type { ExpressionContext, ExpressionNode, LiteralValue, SlotType, ValueType } from './model';

const BOOLEAN: SlotType = { kind: 'boolean' };
const ANY_NUMBER: SlotType = { kind: 'number' };
/** A measurement of any unit: a factor left open while its partner is one derives with it. */
const MEASUREMENT_ANY: SlotType = { kind: 'measurement' };

function literalType(value: LiteralValue): ValueType {
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number') return { kind: 'integer' };
  if (typeof value === 'string')
    return /^-?\d+(\.\d+)?$/u.test(value) ? { kind: 'decimal' } : { kind: 'short_text' };
  if ('amount' in value) return { kind: 'measurement', unit: value.unit };
  if ('optionId' in value) return { kind: 'enum' };
  return { kind: 'reference' };
}

function isMeasurement(type: SlotType | undefined): type is { kind: 'measurement'; unit: string } {
  return type?.kind === 'measurement' && 'unit' in type && type.unit !== undefined;
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
function ownType(context: ExpressionContext, node: ExpressionNode): SlotType | undefined {
  if (node.op === 'read') {
    const { field } = resolveRead(context, node);
    if (field === undefined) return undefined;
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
    if (combined.term.length === 0) return { kind: 'decimal' };
    return { kind: 'measurement', unit: formatUnitTerm(combined.term) };
  }
  return undefined;
}

/**
 * The two slot types of a measurement product or quotient: each side that
 * already resolves to a measurement keeps its own unit; a side that does not
 * yet opens to a decimal or any measurement (Inventory ADR-002 D5), and
 * `undefined` when neither side is a measurement yet, deferring to the old
 * scalar fallback.
 */
function derivedTypes(
  context: ExpressionContext,
  node: ExpressionNode
): readonly [SlotType, SlotType] | undefined {
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
  expected: SlotType
): readonly [SlotType, SlotType] {
  const derived = derivedTypes(context, node);
  if (derived !== undefined) return derived;
  return isNumericKind(expected.kind) ? [ANY_NUMBER, ANY_NUMBER] : [expected, expected];
}

function childTypes(
  context: ExpressionContext,
  node: ExpressionNode,
  expected: SlotType
): readonly (SlotType | undefined)[] {
  switch (node.op) {
    case 'not':
    case 'and':
    case 'or':
      return [BOOLEAN, BOOLEAN];
    case 'if':
      return [BOOLEAN, expected, expected];
    case 'equal':
    case 'less_than':
      return [ownType(context, node.right), ownType(context, node.left)];
    case 'multiply':
    case 'divide':
      return multiplyDivideTypes(context, node, expected);
    case 'coalesce':
      return node.values.map(() => expected);
    default:
      return [expected, expected];
  }
}

/**
 * The type every slot in the tree accepts, keyed by issue path, for the
 * palette's filter and the field picker. It mirrors the server more closely
 * than a scalar factor would: a chain of measurement products and quotients
 * derives the combined unit (cm × cm = cm², Inventory ADR-002 D5), a factor
 * not yet a measurement opens to any number or measurement, and a factor of
 * a non-measurement product still takes any number, since the server is the
 * final word; each side of a comparison takes the type of the other side
 * when that side is a field or a fixed value, so the side being chosen never
 * narrows itself; every input of `if` and `coalesce` returns the field's own
 * type. The server's issues are the answer on whether the finished tree types.
 */
export function slotTypes(
  context: ExpressionContext,
  root: ExpressionNode,
  fieldType: ValueType
): ReadonlyMap<string, SlotType | undefined> {
  const types = new Map<string, SlotType | undefined>();
  const visit = (node: ExpressionNode, path: string, expected: SlotType | undefined) => {
    types.set(path, expected);
    const expectations = expected === undefined ? [] : childTypes(context, node, expected);
    nodeChildren(node).forEach((child, index) => {
      visit(child.node, `${path}.${child.segment}`, expectations[index]);
    });
  };
  visit(root, ROOT_PATH, fieldType);
  return types;
}

/**
 * Whether a field fits a slot: one value, of the slot's exact kind and unit,
 * any number for a bare number slot, or, for a measurement slot (Inventory
 * ADR-002 D5), a field of the same dimension when the slot has a fixed unit
 * (add, subtract and compare convert it), or any decimal, integer or
 * measurement when the slot is left open for a product or quotient to derive
 * its own unit.
 */
export function fieldFitsSlot(
  field: { readonly kind: ValueType['kind']; readonly unit?: string; readonly cardinality: string },
  expected: SlotType | undefined
): boolean {
  if (field.cardinality !== 'one') return false;
  if (expected === undefined) return true;
  if (expected.kind === 'number') return isNumericKind(field.kind);
  if (expected.kind !== 'measurement')
    return field.kind === expected.kind && field.unit === expected.unit;
  if (expected.unit === undefined)
    return field.kind === 'measurement' || field.kind === 'decimal' || field.kind === 'integer';
  return (
    field.kind === 'measurement' &&
    field.unit !== undefined &&
    sameDimension(unitDimension(field.unit), unitDimension(expected.unit))
  );
}
