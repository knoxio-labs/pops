import { sameDimension, unitDimension } from '@pops/inventory';

import { resolveRead } from './catalogue-lookup';
import { isNumericKind } from './model';
import { ROOT_PATH, nodeChildren } from './tree';

import type { ExpressionContext, ExpressionNode, LiteralValue, SlotType, ValueType } from './model';

const BOOLEAN: SlotType = { kind: 'boolean' };
const ANY_NUMBER: SlotType = { kind: 'number' };

function literalType(value: LiteralValue): ValueType {
  if (typeof value === 'boolean') return { kind: 'boolean' };
  if (typeof value === 'number') return { kind: 'integer' };
  if (typeof value === 'string')
    return /^-?\d+(\.\d+)?$/u.test(value) ? { kind: 'decimal' } : { kind: 'short_text' };
  if ('amount' in value) return { kind: 'measurement', unit: value.unit };
  if ('optionId' in value) return { kind: 'enum' };
  return { kind: 'reference' };
}

/** The type a compared operand carries on its own, used to type the other side. */
function ownType(context: ExpressionContext, node: ExpressionNode): SlotType | undefined {
  if (node.op === 'read') {
    const { field } = resolveRead(context, node);
    if (field === undefined) return undefined;
    return field.unit === undefined ? { kind: field.kind } : { kind: field.kind, unit: field.unit };
  }
  if (node.op === 'literal') return literalType(node.value);
  return undefined;
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
      return isNumericKind(expected.kind) ? [ANY_NUMBER, ANY_NUMBER] : [expected, expected];
    case 'coalesce':
      return node.values.map(() => expected);
    default:
      return [expected, expected];
  }
}

/**
 * The type every slot in the tree accepts, keyed by issue path, for the
 * palette's filter and the field picker. It is deliberately looser than the
 * server: a factor of a product or quotient takes any number, since derived
 * units (cm × cm = cm²) are the server's to check; each side of a comparison
 * takes the type of the other side when that side is a field or a fixed value,
 * so the side being chosen never narrows itself; every input of `if` and
 * `coalesce` returns the field's own type. The server's issues are the answer
 * on whether the finished tree types.
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

function sameUnitDimension(actual: string | undefined, expected: string | undefined): boolean {
  if (actual === expected) return true;
  if (actual === undefined || expected === undefined) return false;
  return sameDimension(unitDimension(actual), unitDimension(expected));
}

/**
 * Whether a field fits a slot: one value, of the slot's kind, or any number.
 * A measurement fits a measurement slot in any unit of the same dimension
 * (mm where cm is expected), since expression version 2 converts between
 * them exactly; a unit with no known dimension fits only itself.
 */
export function fieldFitsSlot(
  field: { readonly kind: ValueType['kind']; readonly unit?: string; readonly cardinality: string },
  expected: SlotType | undefined
): boolean {
  if (field.cardinality !== 'one') return false;
  if (expected === undefined) return true;
  if (expected.kind === 'number') return isNumericKind(field.kind);
  if (field.kind !== expected.kind) return false;
  return sameUnitDimension(field.unit, expected.unit);
}
