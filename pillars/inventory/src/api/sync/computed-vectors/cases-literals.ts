import { ITEM, OPTION, lit } from './fixture.js';

import type { ExpressionVectorCase } from './fixture.js';

const LONG_TEXT = 'a'.repeat(201);

/** One literal per primitive result kind, each round-tripping its canonical wire form. */
export const LITERAL_CASES: readonly ExpressionVectorCase[] = [
  { name: 'literal short_text', expression: lit('Shelf label'), kind: 'short_text' },
  { name: 'literal long_text', expression: lit(LONG_TEXT), kind: 'long_text' },
  { name: 'literal integer', expression: lit(-42), kind: 'integer' },
  { name: 'literal decimal keeps its scale', expression: lit('1.500'), kind: 'decimal' },
  { name: 'literal boolean', expression: lit(true), kind: 'boolean' },
  { name: 'literal enum', expression: lit({ optionId: OPTION.red }), kind: 'enum' },
  {
    name: 'literal measurement',
    expression: lit({ amount: '12.5', unit: 'mm' }),
    kind: 'measurement',
    fixedUnit: 'mm',
  },
  { name: 'literal date', expression: lit('2026-02-28'), kind: 'date' },
  { name: 'literal date_time', expression: lit('2026-02-28T09:30:00.000Z'), kind: 'date_time' },
  { name: 'literal url', expression: lit('https://example.com/manual.pdf'), kind: 'url' },
  {
    name: 'literal item reference',
    expression: lit({ targetKind: 'item', targetId: ITEM.a }),
    kind: 'reference',
  },
  {
    name: 'literal location reference',
    expression: lit({ targetKind: 'location', targetId: ITEM.location }),
    kind: 'reference',
  },
  {
    name: 'a short_text result over 200 scalars is an evaluation error',
    expression: lit(LONG_TEXT),
    kind: 'short_text',
  },
  {
    name: 'a measurement result in another unit is an evaluation error',
    expression: lit({ amount: '1', unit: 'cm' }),
    kind: 'measurement',
    fixedUnit: 'mm',
  },
  {
    name: 'a non-canonical decimal result is an evaluation error',
    expression: lit('01.5'),
    kind: 'decimal',
  },
];
