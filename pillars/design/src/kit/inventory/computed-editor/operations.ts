import { isNumericKind, isTextKind, valueTypeLabel } from './model';

import type { NodeOp, ValueType } from './model';

/** Palette groups, in the order the builder lists them. */
export type OperationGroup = 'values' | 'numbers' | 'text' | 'compare' | 'logic' | 'choose';

/** What an operation returns, which decides which slots it can fill. */
type Returns = 'same' | 'number' | 'text' | 'boolean';

/** Author-facing description of one placeable operation. */
export interface OperationInfo {
  readonly op: Exclude<NodeOp, 'empty'>;
  readonly label: string;
  readonly symbol: string;
  readonly group: OperationGroup;
  readonly hint: string;
  readonly returns: Returns;
}

/** Every operation an author can place, grouped for the palette. */
export const OPERATIONS: readonly OperationInfo[] = [
  {
    op: 'read',
    label: 'Field',
    symbol: 'ab',
    group: 'values',
    hint: 'Read a field from this item or one it references',
    returns: 'same',
  },
  {
    op: 'literal',
    label: 'Fixed value',
    symbol: '1',
    group: 'values',
    hint: 'A value typed here',
    returns: 'same',
  },
  {
    op: 'add',
    label: 'Add',
    symbol: '+',
    group: 'numbers',
    hint: 'Left plus right',
    returns: 'number',
  },
  {
    op: 'subtract',
    label: 'Subtract',
    symbol: '−',
    group: 'numbers',
    hint: 'Left minus right',
    returns: 'number',
  },
  {
    op: 'multiply',
    label: 'Multiply',
    symbol: '×',
    group: 'numbers',
    hint: 'Left times right',
    returns: 'number',
  },
  {
    op: 'divide',
    label: 'Divide',
    symbol: '÷',
    group: 'numbers',
    hint: 'Left divided by right',
    returns: 'number',
  },
  {
    op: 'negate',
    label: 'Negative of',
    symbol: '−x',
    group: 'numbers',
    hint: 'Flips the sign',
    returns: 'number',
  },
  {
    op: 'concat',
    label: 'Join text',
    symbol: '&',
    group: 'text',
    hint: 'Left followed by right',
    returns: 'text',
  },
  {
    op: 'equal',
    label: 'Equals',
    symbol: '=',
    group: 'compare',
    hint: 'Yes when both sides match',
    returns: 'boolean',
  },
  {
    op: 'less_than',
    label: 'Less than',
    symbol: '<',
    group: 'compare',
    hint: 'Yes when left is smaller',
    returns: 'boolean',
  },
  {
    op: 'and',
    label: 'And',
    symbol: 'and',
    group: 'logic',
    hint: 'Yes when both are yes',
    returns: 'boolean',
  },
  {
    op: 'or',
    label: 'Or',
    symbol: 'or',
    group: 'logic',
    hint: 'Yes when either is yes',
    returns: 'boolean',
  },
  {
    op: 'not',
    label: 'Not',
    symbol: 'not',
    group: 'logic',
    hint: 'Flips yes and no',
    returns: 'boolean',
  },
  {
    op: 'if',
    label: 'If',
    symbol: 'if',
    group: 'choose',
    hint: 'Pick between two values on a condition',
    returns: 'same',
  },
  {
    op: 'coalesce',
    label: 'First available',
    symbol: '??',
    group: 'choose',
    hint: 'The first input that has a value',
    returns: 'same',
  },
];

/** Palette group headings. */
export const GROUP_LABELS: Record<OperationGroup, string> = {
  values: 'Values',
  numbers: 'Numbers',
  text: 'Text',
  compare: 'Compare',
  logic: 'Logic',
  choose: 'Choose',
};

/** Looks up the author-facing description of an operation. */
export function operationInfo(op: Exclude<NodeOp, 'empty'>): OperationInfo {
  const info = OPERATIONS.find((candidate) => candidate.op === op);
  if (info === undefined) throw new Error(`Unknown operation ${op}`);
  return info;
}

/**
 * Why an operation cannot fill a slot expecting `expected`, or null when it
 * can. Mirrors the server's type rules so the palette never offers a node the
 * draft would refuse.
 */
export function operationBlockedReason(info: OperationInfo, expected: ValueType): string | null {
  const needs = valueTypeLabel(expected);
  if (info.returns === 'same') return null;
  if (info.returns === 'number')
    return isNumericKind(expected.kind) ? null : `Returns a number; this slot needs ${needs}`;
  if (info.returns === 'text')
    return isTextKind(expected.kind) ? null : `Returns text; this slot needs ${needs}`;
  return expected.kind === 'boolean' ? null : `Returns yes or no; this slot needs ${needs}`;
}
