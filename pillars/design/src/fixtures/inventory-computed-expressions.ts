import type { ExpressionIssue } from '@/kit/inventory/computed-editor/scenario';

import type { BinaryOp, ExpressionNode, LiteralValue } from '@pops/inventory/expression';

const EMPTY: ExpressionNode = { op: 'empty' };

function read(fieldId: string, ...path: string[]): ExpressionNode {
  return { op: 'read', path, fieldId };
}

function literal(value: LiteralValue): ExpressionNode {
  return { op: 'literal', value };
}

function binary(op: BinaryOp, left: ExpressionNode, right: ExpressionNode): ExpressionNode {
  return { op, left, right };
}

/** Replacement value as published: the bundle's quote when there is one, else price × count. */
export const replacementValue: ExpressionNode = {
  op: 'coalesce',
  values: [
    read('replacement_quote', 'part_of'),
    binary('multiply', read('unit_price'), read('package_count')),
  ],
};

/** Replacement value edited to read the bundle's computed per-item price, closing a cycle. */
export const replacementValueCycle: ExpressionNode = {
  op: 'coalesce',
  values: [
    read('per_item_price', 'part_of'),
    binary('multiply', read('unit_price'), read('package_count')),
  ],
};

/** Replacement value reading Unit price through a reference that may land on any type. */
export const replacementFromAnyType: ExpressionNode = binary(
  'multiply',
  read('unit_price', 'replaces'),
  literal('0.8')
);

/** A brand-new computed field with nothing placed yet. */
export const emptyExpression: ExpressionNode = EMPTY;

/** Display name half built: the right side of the join is still empty. */
export const displayNameInProgress: ExpressionNode = binary('concat', read('manufacturer'), EMPTY);

/** Display name finished: manufacturer, a space, then model. */
export const displayName: ExpressionNode = binary(
  'concat',
  read('manufacturer'),
  binary('concat', literal(' '), read('model'))
);

/** Shelf label read two references away, through the bundle and its case. */
export const shelfLabel: ExpressionNode = read('shelf', 'part_of', 'stored_in');

/** Insured value: nothing for an empty package, otherwise price × count. */
export const insuredValue: ExpressionNode = {
  op: 'if',
  condition: binary('less_than', read('package_count'), literal(1)),
  thenBranch: literal('0'),
  elseBranch: binary('multiply', read('unit_price'), read('package_count')),
};

/** Needs attention: worn, or powered without a warranty. */
export const needsAttention: ExpressionNode = binary(
  'or',
  binary('equal', read('condition'), literal({ optionId: 'opt-worn' })),
  binary('and', read('powered'), { op: 'not', value: read('has_warranty') })
);

/** Per-unit saving against the bundle quote shared across the package. */
export const perUnitSaving: ExpressionNode = binary(
  'subtract',
  read('unit_price'),
  binary('divide', read('replacement_quote', 'part_of'), read('package_count'))
);

/**
 * Volume as the box example states it: Width × Height × Depth. Expression v2
 * derives cm² then cm³ from the two products (Inventory ADR-002 D5).
 */
export const boxVolume: ExpressionNode = binary(
  'multiply',
  binary('multiply', read('width'), read('height')),
  read('depth')
);

/** Volume half built: Width × Height placed, Depth still an empty slot. */
export const boxVolumeInProgress: ExpressionNode = binary(
  'multiply',
  binary('multiply', read('width'), read('height')),
  EMPTY
);

/**
 * A dimension mismatch: Width × Height (cm²) plus Depth (cm) do not share a
 * dimension, so nothing to convert makes them addable.
 */
export const dimensionMismatchExpression: ExpressionNode = binary(
  'add',
  binary('multiply', read('width'), read('height')),
  read('depth')
);

/** Width with lid: a measurement plus a fixed amount in the same unit. */
export const widthWithLid: ExpressionNode = binary(
  'add',
  read('width'),
  literal({ amount: '2', unit: 'cm' })
);

/** The refusal for adding a plain length to an area. */
export const dimensionMismatchIssue: ExpressionIssue = {
  path: 'expression.right',
  code: 'expression_type_mismatch',
  title: 'Depth cannot go here',
  message:
    'Adding takes both sides in the same dimension, converting one into the other. The left side is measurement in cm² (length²) and Depth is measurement in cm (length), so nothing converts one into the other.',
};

/** The refusal for a definition that reads itself through another type. */
export const cycleIssue: ExpressionIssue = {
  path: 'expression',
  code: 'expression_cycle',
  title: 'Replacement value would read itself',
  message:
    'Per-item price on Bundle already reads Replacement value through Featured item, so neither could ever be calculated.',
  cycle: [
    'Electronics › Replacement value',
    'Bundle › Per-item price',
    'Electronics › Replacement value',
  ],
};

/** The refusal for reading a field that some target types of the reference lack. */
export const fieldUnknownIssue: ExpressionIssue = {
  path: 'expression.left.fieldId',
  code: 'expression_field_unknown',
  title: 'Unit price is not on every type Replaces can point to',
  message:
    'Replaces may point to a Bundle, Case or Storage box, and none of them has Unit price. Read a field every target type has, or read through a reference that only points to Electronics.',
};
