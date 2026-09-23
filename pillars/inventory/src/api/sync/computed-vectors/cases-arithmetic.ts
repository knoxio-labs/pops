import { FIELD, bin, field, lit, read, root, un } from './fixture.js';

import type { PrimitiveKind } from '../../../catalogue/value-types.js';
import type { ExpressionVectorCase } from './fixture.js';

const MAX_SAFE = 9_007_199_254_740_991;

function arithmetic(
  name: string,
  [op, left, right]: readonly [string, unknown, unknown],
  kind: PrimitiveKind
): ExpressionVectorCase {
  return { name, expression: bin(op, lit(left), lit(right)), kind };
}

function measured(name: string, expression: unknown): ExpressionVectorCase {
  return {
    name,
    expression,
    kind: 'measurement',
    fixedUnit: 'mm',
    items: [root(field(FIELD.length, { amount: '120.5', unit: 'mm' }))],
  };
}

/** Exact integer, decimal and fixed-unit arithmetic and each of its failure codes. */
export const ARITHMETIC_CASES: readonly ExpressionVectorCase[] = [
  arithmetic('integer add', ['add', 40, 2], 'integer'),
  arithmetic('integer subtract below zero', ['subtract', 2, 40], 'integer'),
  arithmetic('integer multiply', ['multiply', -6, 7], 'integer'),
  arithmetic('integer divide exactly', ['divide', 42, -6], 'integer'),
  arithmetic('inexact integer divide is precision_overflow', ['divide', 7, 2], 'integer'),
  arithmetic('integer divide by zero', ['divide', 7, 0], 'integer'),
  arithmetic('integer add past the safe range', ['add', MAX_SAFE, 1], 'integer'),
  arithmetic('integer multiply past the safe range', ['multiply', MAX_SAFE, 2], 'integer'),
  arithmetic('integer add at the safe bound', ['add', MAX_SAFE - 1, 1], 'integer'),
  arithmetic('decimal add aligns scales', ['add', '1.5', '2.25'], 'decimal'),
  arithmetic('decimal subtract to a negative', ['subtract', '1.00', '2.5'], 'decimal'),
  arithmetic('decimal subtract to zero keeps scale', ['subtract', '0.50', '0.50'], 'decimal'),
  arithmetic('decimal multiply adds scales', ['multiply', '16.0', '3.00'], 'decimal'),
  arithmetic('decimal multiply of negatives', ['multiply', '-0.5', '-0.25'], 'decimal'),
  arithmetic('decimal divide terminating', ['divide', '1', '8'], 'decimal'),
  arithmetic('decimal divide at nine places', ['divide', '1', '512'], 'decimal'),
  arithmetic('decimal divide needing ten places', ['divide', '1', '1024'], 'decimal'),
  arithmetic('decimal divide non-terminating', ['divide', '1', '3'], 'decimal'),
  arithmetic('decimal divide by zero with scale', ['divide', '5', '0.00'], 'decimal'),
  arithmetic('decimal divide scales down', ['divide', '48.000', '3.00'], 'decimal'),
  arithmetic('decimal divide negative', ['divide', '-7.5', '2.5'], 'decimal'),
  arithmetic('decimal add past eighteen digits', ['add', '999999999999999999', '1'], 'decimal'),
  arithmetic('decimal multiply past nine places', ['multiply', '0.00001', '0.00001'], 'decimal'),
  arithmetic(
    'decimal multiply at eighteen digits',
    ['multiply', '999999999.999999999', '1'],
    'decimal'
  ),
  arithmetic(
    'a thirty-six digit product is precision_overflow, not a trap',
    ['multiply', '999999999999999999', '999999999999999999'],
    'decimal'
  ),
  arithmetic(
    'a twenty-seven digit quotient is precision_overflow, not a trap',
    ['divide', '999999999999999999', '0.000000007'],
    'decimal'
  ),
  arithmetic('integer zero divided by a negative is zero', ['divide', 0, -5], 'integer'),
  arithmetic('mixed integer and decimal is an evaluation error', ['add', 1, '1'], 'decimal'),
  { name: 'negate integer', expression: un('negate', lit(5)), kind: 'integer' },
  { name: 'negate integer zero', expression: un('negate', lit(0)), kind: 'integer' },
  { name: 'negate negative decimal', expression: un('negate', lit('-0.5')), kind: 'decimal' },
  {
    name: 'negate zero decimal stays unsigned',
    expression: un('negate', lit('0.0')),
    kind: 'decimal',
  },
  measured('measurement add', bin('add', read(FIELD.length), lit({ amount: '0.5', unit: 'mm' }))),
  measured(
    'measurement subtract',
    bin('subtract', read(FIELD.length), lit({ amount: '200', unit: 'mm' }))
  ),
  measured('measurement times decimal', bin('multiply', read(FIELD.length), lit('2.0'))),
  measured('measurement divided by decimal', bin('divide', read(FIELD.length), lit('4'))),
  measured('measurement negate', un('negate', read(FIELD.length))),
  measured(
    'measurement add across units is an evaluation error',
    bin('add', read(FIELD.length), lit({ amount: '1', unit: 'cm' }))
  ),
];
