import { ownerType, readLabel, resolveRead } from './catalogue-lookup';
import { outlineRows } from './tree';

import type { ExpressionContext, ExpressionField, ExpressionNode, LiteralValue } from './model';

/** One static field dependency: the field, the type it is on and the path that reaches it. */
export interface StaticDependency {
  readonly key: string;
  readonly typeLabel: string;
  readonly fieldLabel: string;
  readonly via: readonly string[];
}

const DECIMAL_TEXT = /^-?\d+(\.\d+)?$/u;

const INFIX: Partial<Record<ExpressionNode['op'], string>> = {
  add: '+',
  subtract: '−',
  multiply: '×',
  divide: '÷',
  equal: '=',
  less_than: '<',
  and: 'and',
  or: 'or',
};

/** Formats a literal the way the author typed it; option ids read as their labels. */
export function formatLiteral(value: LiteralValue, field?: ExpressionField): string {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (typeof value === 'string') return DECIMAL_TEXT.test(value) ? value : `“${value}”`;
  if ('amount' in value) return `${value.amount} ${value.unit}`;
  if ('targetId' in value) return value.targetId;
  return field?.options?.find((option) => option.id === value.optionId)?.label ?? value.optionId;
}

function wrap(text: string, node: ExpressionNode): string {
  return INFIX[node.op] === undefined ? text : `(${text})`;
}

/**
 * The field a literal under `parent` names its choice from: for an equality,
 * the read on the other side. Anywhere else a literal has no choice field.
 */
export function comparedChoiceField(
  context: ExpressionContext,
  parent: ExpressionNode | undefined
): ExpressionField | undefined {
  if (parent?.op !== 'equal') return undefined;
  const partner = parent.left.op === 'read' ? parent.left : parent.right;
  return partner.op === 'read' ? resolveRead(context, partner).field : undefined;
}

/**
 * Reads an expression back as one line of text, so an author can check a
 * loaded or nested expression without opening every node.
 */
export function formula(
  context: ExpressionContext,
  node: ExpressionNode,
  choiceField?: ExpressionField
): string {
  const part = (child: ExpressionNode) =>
    wrap(formula(context, child, comparedChoiceField(context, node)), child);
  switch (node.op) {
    case 'empty':
      return '…';
    case 'literal':
      return formatLiteral(node.value, choiceField);
    case 'read':
      return readLabel(context, node);
    case 'negate':
      return `−${part(node.value)}`;
    case 'not':
      return `not ${part(node.value)}`;
    case 'concat':
      return `join(${formula(context, node.left)}, ${formula(context, node.right)})`;
    case 'if':
      return `if ${formula(context, node.condition)} then ${formula(context, node.thenBranch)} otherwise ${formula(context, node.elseBranch)}`;
    case 'coalesce':
      return `first available(${node.values.map((value) => formula(context, value)).join(', ')})`;
    default:
      return `${part(node.left)} ${INFIX[node.op] ?? node.op} ${part(node.right)}`;
  }
}

/**
 * Every field the expression reads, including each reference it follows, once
 * per type and field. This is the count the server bounds at 32.
 */
export function staticDependencies(
  context: ExpressionContext,
  root: ExpressionNode
): readonly StaticDependency[] {
  const unique = new Map<string, StaticDependency>();
  const add = (typeLabel: string, field: ExpressionField, via: readonly string[]) => {
    const key = `${typeLabel}:${field.id}`;
    if (!unique.has(key)) unique.set(key, { key, typeLabel, fieldLabel: field.label, via });
  };
  for (const row of outlineRows(root)) {
    if (row.node.op !== 'read') continue;
    const resolved = resolveRead(context, row.node);
    let typeLabel = ownerType(context).label;
    const via: string[] = [];
    for (const hop of resolved.hops) {
      add(typeLabel, hop.field, [...via]);
      via.push(hop.field.label);
      typeLabel = hop.target.label;
    }
    if (resolved.field !== undefined) add(typeLabel, resolved.field, via);
  }
  return [...unique.values()];
}
