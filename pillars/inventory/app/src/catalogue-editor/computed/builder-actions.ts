import {
  isFollowable,
  resolveRead,
  fieldFitsSlot,
  nodeAt,
  nodeChildren,
} from '@pops/inventory/expression';

import { operationNode, replaceAt, updateAt, wrapAt } from '../expression/edit';

import type {
  ExpressionContext,
  ExpressionField,
  ExpressionNode,
  LiteralValue,
  NodeOp,
  ReadNode,
  SlotType,
} from '@pops/inventory/expression';

import type { WrappingOp } from '../expression/edit';

/** The fields of a type a read in a slot may land on, in catalogue order. */
export function fittingFields(
  fields: readonly ExpressionField[],
  expected: SlotType | undefined
): readonly ExpressionField[] {
  return fields.filter((field) => field.archived !== true && fieldFitsSlot(field, expected));
}

const PLAIN_DEFAULTS: Partial<Record<SlotType['kind'], LiteralValue | null>> = {
  boolean: true,
  integer: 0,
  decimal: '0',
  number: '0',
  enum: null,
  reference: null,
};

/** A fixed value of the slot's type to start from, or null when none can be typed. */
export function defaultLiteral(
  expected: SlotType | undefined,
  choiceField: ExpressionField | undefined
): LiteralValue | null {
  if (choiceField?.kind === 'enum') {
    const option = choiceField.options?.[0];
    return option === undefined ? null : { optionId: option.id };
  }
  if (expected?.kind === 'measurement')
    return expected.unit === undefined ? '0' : { amount: '0', unit: expected.unit };
  if (expected === undefined) return '';
  const plain = PLAIN_DEFAULTS[expected.kind];
  return plain === undefined ? '' : plain;
}

/** The node to place in an empty or replaced slot, or null when the slot cannot take it. */
export function placedNode(
  context: ExpressionContext,
  op: Exclude<NodeOp, 'empty'>,
  expected: SlotType | undefined,
  choiceField: ExpressionField | undefined
): ExpressionNode | null {
  if (op === 'read') {
    const owner = context.types.find((type) => type.id === context.ownerTypeId);
    const field = fittingFields(owner?.fields ?? [], expected)[0];
    return field === undefined ? null : { op: 'read', path: [], fieldId: field.id };
  }
  if (op === 'literal') {
    const value = defaultLiteral(expected, choiceField);
    return value === null ? null : { op: 'literal', value };
  }
  return operationNode(op);
}

/** The first empty slot at or below `path`, so the author is taken to what still needs filling. */
export function firstEmptyBelow(root: ExpressionNode, path: string): string {
  const node = nodeAt(root, path);
  if (node === undefined || node.op === 'empty') return path;
  for (const child of nodeChildren(node)) {
    const found = firstEmptyBelow(root, `${path}.${child.segment}`);
    if (nodeAt(root, found)?.op === 'empty') return found;
  }
  return path;
}

/** Places `node` at `path` and returns the tree and the path to select next. */
export function place(
  root: ExpressionNode,
  path: string,
  node: ExpressionNode
): { readonly root: ExpressionNode; readonly selected: string } {
  const next = replaceAt(root, path, node);
  return { root: next, selected: firstEmptyBelow(next, path) };
}

/** Wraps the node at `path` and returns the tree and the new empty slot to select. */
export function wrap(
  root: ExpressionNode,
  path: string,
  op: WrappingOp
): { readonly root: ExpressionNode; readonly selected: string } {
  const next = wrapAt(root, path, op);
  return { root: next, selected: firstEmptyBelow(next, path) };
}

/** The read being edited and the type its slot accepts. */
export interface ReadSlot {
  readonly path: string;
  readonly expected: SlotType | undefined;
}

function updateRead(
  root: ExpressionNode,
  path: string,
  update: (node: ReadNode) => ReadNode
): ExpressionNode {
  return updateAt(root, path, (node) => (node.op === 'read' ? update(node) : node));
}

/**
 * Follows one more reference from where the read at `path` stands. The field
 * it lands on is kept when the target type has it, otherwise the first field
 * there that fits the slot.
 */
export function followReference(
  context: ExpressionContext,
  root: ExpressionNode,
  { path, expected }: ReadSlot,
  reference: ExpressionField
): ExpressionNode {
  if (!isFollowable(reference)) return root;
  return updateRead(root, path, (node) => {
    const extended: ReadNode = { ...node, path: [...node.path, reference.id] };
    const resolved = resolveRead(context, extended);
    if (resolved.field !== undefined && fieldFitsSlot(resolved.field, expected)) return extended;
    const first = fittingFields(resolved.ownerType.fields, expected)[0];
    return first === undefined ? node : { ...extended, fieldId: first.id };
  });
}

/** Stops following references from hop `index` on, keeping the field when it is still reachable. */
export function unfollowFrom(
  context: ExpressionContext,
  root: ExpressionNode,
  { path, expected }: ReadSlot,
  index: number
): ExpressionNode {
  return updateRead(root, path, (node) => {
    const shortened: ReadNode = { ...node, path: node.path.slice(0, index) };
    const resolved = resolveRead(context, shortened);
    if (resolved.field !== undefined) return shortened;
    const first = fittingFields(resolved.ownerType.fields, expected)[0];
    return first === undefined ? node : { ...shortened, fieldId: first.id };
  });
}

/** Points the read at `path` at another field on the type it stands on. */
export function chooseReadField(
  root: ExpressionNode,
  path: string,
  fieldId: string
): ExpressionNode {
  return updateRead(root, path, (node) => ({ ...node, fieldId }));
}

/** Sets the fixed value at `path`. */
export function setLiteral(
  root: ExpressionNode,
  path: string,
  value: LiteralValue
): ExpressionNode {
  return updateAt(root, path, (node) => (node.op === 'literal' ? { ...node, value } : node));
}
