import { EMPTY } from './edit';

import type { ExpressionV1 } from '../../inventory-api/types.gen';
import type { CatalogueField, CatalogueType } from '../types';
import type { ExpressionContext, ExpressionField, ExpressionNode, ValueType } from './model';

const THEN_KEY = 'then' as const;
const ELSE_KEY = 'else' as const;

function conditionalToWire(node: Extract<ExpressionNode, { op: 'if' }>): ExpressionV1 | null {
  const condition = toWire(node.condition);
  const thenBranch = toWire(node.thenBranch);
  const elseBranch = toWire(node.elseBranch);
  if (condition === null || thenBranch === null || elseBranch === null) return null;
  return { op: 'if', condition, [THEN_KEY]: thenBranch, [ELSE_KEY]: elseBranch };
}

function coalesceToWire(node: Extract<ExpressionNode, { op: 'coalesce' }>): ExpressionV1 | null {
  const values = node.values.map(toWire);
  return values.every((value): value is ExpressionV1 => value !== null)
    ? { op: 'coalesce', values }
    : null;
}

/**
 * The draft wire expression for an editor tree, or null while any slot is
 * still empty: an unfinished tree is never sent.
 */
export function toWire(node: ExpressionNode): ExpressionV1 | null {
  switch (node.op) {
    case 'empty':
      return null;
    case 'literal':
      return { op: 'literal', value: node.value };
    case 'read':
      return { op: 'read', path: [...node.path], fieldId: node.fieldId };
    case 'negate':
    case 'not': {
      const value = toWire(node.value);
      return value === null ? null : { op: node.op, value };
    }
    case 'if':
      return conditionalToWire(node);
    case 'coalesce':
      return coalesceToWire(node);
    default: {
      const left = toWire(node.left);
      const right = toWire(node.right);
      return left === null || right === null ? null : { op: node.op, left, right };
    }
  }
}

function isExpression(value: unknown): value is ExpressionV1 {
  return typeof value === 'object' && value !== null && 'op' in value;
}

/**
 * Loads a stored expression back into the editor. The server has already
 * validated it, so anything unrecognised is shown as an empty slot to fill
 * rather than dropped silently.
 */
export function fromWire(value: unknown): ExpressionNode {
  if (!isExpression(value)) return EMPTY;
  switch (value.op) {
    case 'literal':
      return { op: 'literal', value: value.value };
    case 'read':
      return { op: 'read', path: [...value.path], fieldId: value.fieldId };
    case 'negate':
    case 'not':
      return { op: value.op, value: fromWire(value.value) };
    case 'if':
      return {
        op: 'if',
        condition: fromWire(value.condition),
        thenBranch: fromWire(value[THEN_KEY]),
        elseBranch: fromWire(value[ELSE_KEY]),
      };
    case 'coalesce':
      return { op: 'coalesce', values: value.values.map(fromWire) };
    default:
      return { op: value.op, left: fromWire(value.left), right: fromWire(value.right) };
  }
}

function expressionField(field: CatalogueField): ExpressionField {
  return {
    id: field.id,
    label: field.label,
    kind: field.kind,
    ...(field.fixedUnit === null ? {} : { unit: field.fixedUnit }),
    cardinality: field.cardinality,
    storage: field.storage,
    ...(field.archivedAt === null ? {} : { archived: true }),
    ...(field.kind === 'reference'
      ? { reference: { kinds: field.referenceKinds, typeIds: field.referenceTypeIds } }
      : {}),
    ...(field.kind === 'enum'
      ? {
          options: field.enumOptions.map((option) => ({ id: option.id, label: option.label })),
        }
      : {}),
  };
}

/**
 * The builder's view of the draft catalogue. The field being edited is left
 * out of its own type, since a field that reads itself is a cycle.
 */
export function expressionContext(
  types: readonly CatalogueType[],
  ownerTypeId: string,
  editedFieldId: string | undefined
): ExpressionContext {
  return {
    ownerTypeId,
    types: types.map((type) => ({
      id: type.id,
      label: type.label,
      fields: type.fields.filter((field) => field.id !== editedFieldId).map(expressionField),
    })),
  };
}

/** The value type a computed field of this kind and unit returns. */
export function fieldValueType(kind: ValueType['kind'], unit: string): ValueType {
  return kind === 'measurement' && unit.trim() !== '' ? { kind, unit: unit.trim() } : { kind };
}
