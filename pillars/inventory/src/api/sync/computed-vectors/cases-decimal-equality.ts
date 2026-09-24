import { FIELD, bin, cond, field, lit, read, root } from './fixture.js';

import type { ExpressionVectorCase } from './fixture.js';

function compared(
  name: string,
  expressionVersion: 1 | 2,
  expression: unknown,
  items?: ExpressionVectorCase['items']
): ExpressionVectorCase {
  return items === undefined
    ? { name, expressionVersion, expression, kind: 'boolean' }
    : { name, expressionVersion, expression, kind: 'boolean', items };
}

function equal(left: unknown, right: unknown): unknown {
  return bin('equal', left, right);
}

const product = bin('multiply', lit('1.5'), lit('2'));
const price = read(FIELD.price);
const pricedAt = (amount: string): ExpressionVectorCase['items'] => [
  root(field(FIELD.price, amount)),
];
const named = (name: string): ExpressionVectorCase['items'] => [root(field(FIELD.name, name))];

/**
 * Version 2 compares plain decimals by value, at any scale; version 1 keeps
 * comparing their spelling, and text compares by identity in both.
 */
export const DECIMAL_EQUALITY_CASES: readonly ExpressionVectorCase[] = [
  compared(
    'v1 equal compares a product by spelling: 1.5 × 2 = 3 is false',
    1,
    equal(product, lit('3'))
  ),
  compared(
    'v1 equal compares read decimals by spelling',
    1,
    equal(price, lit('1.5')),
    pricedAt('1.50')
  ),
  compared('v1 equal compares negative zero by spelling', 1, equal(lit('-0'), lit('0'))),
  compared(
    'v1 less_than already compares decimals by value',
    1,
    bin('less_than', lit('1.50'), lit('1.5'))
  ),
  compared('v2 equal compares a product by value: 1.5 × 2 = 3', 2, equal(product, lit('3'))),
  compared('v2 equal: 3.0 = 3', 2, equal(lit('3.0'), lit('3'))),
  compared('v2 equal: a read 1.50 = 1.5', 2, equal(price, lit('1.5')), pricedAt('1.50')),
  compared('v2 equal: 1.5 = a read 1.50', 2, equal(lit('1.5'), price), pricedAt('1.50')),
  compared('v2 equal: 1.5 ≠ 1.51', 2, equal(lit('1.5'), lit('1.51'))),
  compared('v2 equal: -1.50 = -1.5', 2, equal(lit('-1.50'), lit('-1.5'))),
  compared('v2 equal: -1.5 ≠ 1.5', 2, equal(lit('-1.5'), lit('1.5'))),
  compared('v2 equal: negative zero equals zero', 2, equal(lit('-0'), lit('0.0'))),
  compared('v2 equal: 0 = 0.000000000', 2, equal(lit('0'), lit('0.000000000'))),
  compared(
    'v2 equal: 18 significant digits differ in the ninth place',
    2,
    equal(lit('123456789.123456789'), lit('123456789.123456788'))
  ),
  compared(
    'v2 equal: 18 integer digits equal the same with 9 zero places',
    2,
    equal(lit('999999999999999999'), lit('999999999999999999.000000000'))
  ),
  compared(
    'v2 equal: 0.000000001 = 0.0000000010',
    2,
    equal(lit('0.000000001'), lit('0.0000000010'))
  ),
  compared('v2 equal: 0.000000001 ≠ 0.000000002', 2, equal(lit('0.000000001'), lit('0.000000002'))),
  compared(
    'v2 equal types an if by its then branch',
    2,
    equal(cond(lit(true), lit('3.0'), price), lit('3'))
  ),
  compared(
    'v2 equal on text still compares spelling',
    2,
    equal(read(FIELD.name), lit('3')),
    named('3.0')
  ),
  compared('v2 equal on text literals compares spelling', 2, equal(lit('a'), lit('a'))),
  compared('v2 equal: a leading zero spells text, so 007 ≠ 7', 2, equal(lit('007'), lit('7'))),
  compared(
    'v2 equal types a coalesce by its first argument, so a text default stays text',
    2,
    equal({ op: 'coalesce', values: [read(FIELD.name), lit('0')] }, lit('0.0'))
  ),
  {
    name: 'v2 equal on a read the catalogue does not type compares spelling',
    expressionVersion: 2,
    expression: equal(price, lit('1.5')),
    kind: 'boolean',
    items: pricedAt('1.50'),
    fieldKinds: {},
  },
  compared(
    'v2 equal between a decimal and a non-decimal is an evaluation error',
    2,
    equal(price, lit('abc')),
    pricedAt('1.5')
  ),
  compared('v2 less_than: 1.50 < 1.5 is false', 2, bin('less_than', lit('1.50'), lit('1.5'))),
  compared('v2 less_than: 2.9 < 3.0', 2, bin('less_than', lit('2.9'), lit('3.0'))),
  compared('v2 less_than: -0.1 < 0', 2, bin('less_than', lit('-0.1'), lit('0'))),
  compared(
    'v2 less_than at 9 places',
    2,
    bin('less_than', lit('0.000000001'), lit('0.0000000010'))
  ),
];
