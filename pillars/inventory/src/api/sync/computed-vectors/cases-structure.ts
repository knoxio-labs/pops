import { FIELD, bin, field, lit, read, root, un } from './fixture.js';

import type { ExpressionVectorCase } from './fixture.js';

function nested(depth: number): unknown {
  let node: unknown = lit(1);
  for (let level = 0; level < depth; level += 1) node = un('negate', node);
  return node;
}

/** Structural rejections the parser owns, which a client must reproduce before evaluating. */
export const STRUCTURE_CASES: readonly ExpressionVectorCase[] = [
  { name: 'exactly 128 nodes evaluate', expression: nested(127), kind: 'integer' },
  { name: '129 nodes are rejected', expression: nested(128), kind: 'integer' },
  {
    name: 'three reference hops exceed the traversal limit',
    expression: read(FIELD.price, [FIELD.ref, FIELD.ref, FIELD.ref]),
    kind: 'decimal',
  },
  {
    name: 'an unknown op is rejected',
    expression: { op: 'modulo', left: lit(1), right: lit(1) },
    kind: 'integer',
  },
  { name: 'a missing op is rejected', expression: { value: lit(1) }, kind: 'integer' },
  { name: 'a non-object node is rejected', expression: bin('add', 1, lit(1)), kind: 'integer' },
  {
    name: 'an extra key is rejected',
    expression: { op: 'literal', value: 1, note: 'x' },
    kind: 'integer',
  },
  {
    name: 'if spelled with thenBranch is rejected',
    expression: { op: 'if', condition: lit(true), thenBranch: lit(1), elseBranch: lit(2) },
    kind: 'integer',
  },
  { name: 'a fractional number literal is rejected', expression: lit(1.5), kind: 'integer' },
  {
    name: 'an unsafe integer literal is rejected',
    expression: lit(9_007_199_254_740_992),
    kind: 'integer',
  },
  { name: 'a null literal is rejected', expression: lit(null), kind: 'integer' },
  {
    name: 'an object literal with unknown keys is rejected',
    expression: lit({ amount: '1', unit: 'mm', extra: true }),
    kind: 'measurement',
    fixedUnit: 'mm',
  },
  { name: 'an empty read field id is rejected', expression: read(''), kind: 'decimal' },
  {
    name: 'a non-string path element is rejected',
    expression: { op: 'read', path: [1], fieldId: FIELD.price },
    kind: 'decimal',
  },
  {
    name: 'expression version 2 is rejected',
    expressionVersion: 2,
    expression: lit('1'),
    kind: 'decimal',
  },
];

/** Override precedence: an allowed override wins without evaluating the expression. */
export const OVERRIDE_CASES: readonly ExpressionVectorCase[] = [
  {
    name: 'an override wins over a computable expression',
    expression: bin('multiply', read(FIELD.count), read(FIELD.price)),
    kind: 'decimal',
    allowOverride: true,
    override: '50.000',
    items: [root(field(FIELD.count, '16.0'), field(FIELD.price, '3.00'))],
  },
  {
    name: 'an override wins when a dependency is missing',
    expression: bin('multiply', read(FIELD.count), read(FIELD.price)),
    kind: 'decimal',
    allowOverride: true,
    override: '50.000',
    items: [root(field(FIELD.count, '16.0'))],
  },
  {
    name: 'without an override the expression is evaluated',
    expression: bin('multiply', read(FIELD.count), read(FIELD.price)),
    kind: 'decimal',
    allowOverride: true,
    items: [root(field(FIELD.count, '16.0'), field(FIELD.price, '3.00'))],
  },
  {
    name: 'an override on a field that forbids one is rejected',
    expression: lit('1'),
    kind: 'decimal',
    override: '2',
  },
];
