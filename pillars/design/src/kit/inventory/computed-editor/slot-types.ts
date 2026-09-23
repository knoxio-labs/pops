import { resolveRead } from './catalogue-lookup';
import { ROOT_PATH, nodeChildren } from './tree';

import type { ExpressionContext, ExpressionNode, LiteralValue, ValueType } from './model';

const BOOLEAN: ValueType = { kind: 'boolean' };
const DECIMAL: ValueType = { kind: 'decimal' };

function literalType(value: LiteralValue): ValueType {
  if (typeof value === 'boolean') return BOOLEAN;
  if (typeof value === 'number') return { kind: 'integer' };
  if (typeof value === 'string')
    return /^-?\d+(\.\d+)?$/u.test(value) ? DECIMAL : { kind: 'short_text' };
  if ('amount' in value) return { kind: 'measurement', unit: value.unit };
  return { kind: 'enum' };
}

/** The type a compared operand carries on its own, used to type the other side. */
function ownType(context: ExpressionContext, node: ExpressionNode): ValueType | undefined {
  if (node.op === 'read') {
    const { field } = resolveRead(context, node);
    return field.unit === undefined ? { kind: field.kind } : { kind: field.kind, unit: field.unit };
  }
  if (node.op === 'literal') return literalType(node.value);
  return undefined;
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
      return [expected, expected.kind === 'measurement' ? DECIMAL : expected];
    case 'coalesce':
      return node.args.map(() => expected);
    default:
      return [expected, expected];
  }
}

/**
 * The type every slot in the tree must produce, keyed by issue path. Mirrors
 * the server's rules: a measurement multiplied or divided takes a plain decimal
 * on the right, both sides of a comparison share the left operand's type, and
 * every input of `if` and `coalesce` returns the field's own type.
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
