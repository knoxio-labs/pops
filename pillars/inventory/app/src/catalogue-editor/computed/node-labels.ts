import {
  readLabel,
  comparedChoiceField,
  formatLiteral,
  operationInfo,
  ROOT_PATH,
  nodeAt,
  outlineRows,
  parentPath,
} from '@pops/inventory/expression';

import type {
  ExpressionContext,
  ExpressionField,
  ExpressionNode,
} from '@pops/inventory/expression';

/** The symbol an outline row shows in its badge. */
export function nodeSymbol(node: ExpressionNode): string {
  return node.op === 'empty' ? '?' : operationInfo(node.op).symbol;
}

/** The text an outline row or input row shows for its node. */
export function nodeTitle(
  context: ExpressionContext,
  node: ExpressionNode,
  choiceField?: ExpressionField
): string {
  if (node.op === 'empty') return 'Choose a value';
  if (node.op === 'read') return readLabel(context, node);
  if (node.op === 'literal') return formatLiteral(node.value, choiceField);
  return operationInfo(node.op).label;
}

/** "Right of Multiply" style description of the slot a path fills. */
export function slotDescription(root: ExpressionNode, path: string): string {
  if (path === ROOT_PATH) return 'Whole expression';
  const row = outlineRows(root).find((candidate) => candidate.path === path);
  const parent = nodeAt(root, parentPath(path));
  if (parent === undefined || parent.op === 'empty') return row?.slot ?? '';
  return `${row?.slot ?? ''} of ${operationInfo(parent.op).label}`;
}

/** The choice field a literal at `path` names its option from, if its parent compares one. */
export function choiceFieldAt(
  context: ExpressionContext,
  root: ExpressionNode,
  path: string
): ExpressionField | undefined {
  return comparedChoiceField(context, nodeAt(root, parentPath(path)));
}
