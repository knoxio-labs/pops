import { FIELD, ITEM, OPTION, bin, cond, field, lit, read, refTo, root, un } from './fixture.js';

import type { ExpressionVectorCase } from './fixture.js';

function compared(name: string, op: string, left: unknown, right: unknown): ExpressionVectorCase {
  return { name, expression: bin(op, lit(left), lit(right)), kind: 'boolean' };
}

/** "e" with an acute accent as one code point, and as "e" plus a combining accent. */
const PRECOMPOSED = String.fromCodePoint(0xe9);
const DECOMPOSED = `e${String.fromCodePoint(0x301)}`;

const flagged = [root(field(FIELD.flag, true), field(FIELD.price, '2.50'))];

/** Text, comparison, boolean and conditional nodes, including their short-circuits. */
export const LOGIC_CASES: readonly ExpressionVectorCase[] = [
  { name: 'concat', expression: bin('concat', lit('Box '), lit('A')), kind: 'short_text' },
  {
    name: 'concat past 200 scalars is an evaluation error',
    expression: bin('concat', lit('b'.repeat(150)), lit('c'.repeat(51))),
    kind: 'short_text',
  },
  {
    name: 'concat counts Unicode scalars, not UTF-16 units',
    expression: bin('concat', lit('\u{1F4E6}'.repeat(100)), lit('\u{1F4E6}'.repeat(100))),
    kind: 'short_text',
  },
  {
    name: 'measurement units match by code unit, not canonical equivalence',
    expression: bin(
      'add',
      lit({ amount: '1', unit: PRECOMPOSED }),
      lit({ amount: '1', unit: DECOMPOSED })
    ),
    kind: 'measurement',
    fixedUnit: PRECOMPOSED,
  },
  compared('equal integers', 'equal', 3, 3),
  compared('equal decimals compare spelling, not magnitude', 'equal', '1.0', '1.00'),
  compared('equal booleans', 'equal', false, false),
  compared('equal enums', 'equal', { optionId: OPTION.red }, { optionId: OPTION.blue }),
  compared('equal text', 'equal', 'a', 'a'),
  compared(
    'equal text compares code units, not canonical equivalence',
    'equal',
    PRECOMPOSED,
    DECOMPOSED
  ),
  compared('equal measurements', 'equal', { amount: '2', unit: 'mm' }, { amount: '2', unit: 'mm' }),
  compared('equal references', 'equal', refTo(ITEM.a), refTo(ITEM.a)),
  compared('equal across kinds is false', 'equal', refTo(ITEM.a), { optionId: OPTION.red }),
  compared('less_than integers', 'less_than', -1, 0),
  compared('less_than decimals across scales', 'less_than', '1.5', '1.25'),
  compared('less_than equal decimals', 'less_than', '2.0', '2'),
  compared(
    'less_than measurements',
    'less_than',
    { amount: '9.99', unit: 'mm' },
    { amount: '10', unit: 'mm' }
  ),
  compared('less_than on text is an evaluation error', 'less_than', 'a', 'b'),
  { name: 'not', expression: un('not', read(FIELD.flag)), kind: 'boolean', items: flagged },
  {
    name: 'and short-circuits on false before a missing read',
    expression: bin('and', un('not', read(FIELD.flag)), read(FIELD.absent)),
    kind: 'boolean',
    items: flagged,
  },
  {
    name: 'and reaches a missing right side',
    expression: bin('and', read(FIELD.flag), read(FIELD.absent)),
    kind: 'boolean',
    items: flagged,
  },
  {
    name: 'and of two trues',
    expression: bin('and', read(FIELD.flag), lit(true)),
    kind: 'boolean',
    items: flagged,
  },
  {
    name: 'or short-circuits on true before a missing read',
    expression: bin('or', read(FIELD.flag), read(FIELD.absent)),
    kind: 'boolean',
    items: flagged,
  },
  {
    name: 'or of two falses',
    expression: bin('or', lit(false), un('not', read(FIELD.flag))),
    kind: 'boolean',
    items: flagged,
  },
  {
    name: 'if evaluates only the selected branch',
    expression: cond(read(FIELD.flag), read(FIELD.price), read(FIELD.absent)),
    kind: 'decimal',
    items: flagged,
  },
  {
    name: 'if else branch',
    expression: cond(un('not', read(FIELD.flag)), read(FIELD.absent), lit('0')),
    kind: 'decimal',
    items: flagged,
  },
  {
    name: 'if with a missing selected branch keeps the condition dependencies',
    expression: cond(read(FIELD.flag), read(FIELD.absent), lit('0')),
    kind: 'decimal',
    items: flagged,
  },
  {
    name: 'if with a missing condition',
    expression: cond(read(FIELD.absent), lit('1'), lit('0')),
    kind: 'decimal',
  },
  {
    name: 'if on a non-boolean condition is an evaluation error',
    expression: cond(read(FIELD.price), lit('1'), lit('0')),
    kind: 'decimal',
    items: flagged,
  },
  {
    name: 'a failure keeps the dependencies read before it',
    expression: bin('divide', read(FIELD.price), lit('0')),
    kind: 'decimal',
    items: flagged,
  },
];
