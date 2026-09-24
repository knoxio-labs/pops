import { FIELD, ITEM, bin, field, lit, read, refTo, root } from './fixture.js';

import type { ExpressionVectorCase } from './fixture.js';

function coalesce(...values: readonly unknown[]): {
  readonly op: 'coalesce';
  readonly values: readonly unknown[];
} {
  return { op: 'coalesce', values };
}

const priced = [root(field(FIELD.price, '2.50'), field(FIELD.ref, refTo(ITEM.missing)))];

/** `coalesce`: the only node that skips an unavailable argument. */
export const COALESCE_CASES: readonly ExpressionVectorCase[] = [
  {
    name: 'coalesce skips a missing input to the first available one',
    expression: coalesce(read(FIELD.absent), read(FIELD.price)),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce stops at its first value without reading the rest',
    expression: coalesce(read(FIELD.price), read(FIELD.absent), read(FIELD.price, [FIELD.ref])),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce falls back to a literal default',
    expression: coalesce(read(FIELD.price, [FIELD.ref]), lit('0')),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce of only unavailable inputs reports the last reason and every traversal',
    expression: coalesce(read(FIELD.price, [FIELD.ref]), read(FIELD.absent)),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce with no value names every missing input and its item',
    expression: coalesce(read(FIELD.absent), read(FIELD.price, [FIELD.ref]), read(FIELD.count)),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce names each missing input once',
    expression: coalesce(read(FIELD.absent), read(FIELD.count), read(FIELD.absent)),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'nested coalesce flattens its missing inputs',
    expression: coalesce(coalesce(read(FIELD.absent), read(FIELD.count)), read(FIELD.name)),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce passes on a computed input’s own missing inputs',
    expression: coalesce(read(FIELD.upstream), read(FIELD.absent)),
    kind: 'decimal',
    items: [
      root(
        {
          fieldId: FIELD.upstream,
          state: 'unavailable',
          reason: 'reference_missing',
          failedFieldId: FIELD.price,
          traversedItemIds: [ITEM.root, ITEM.missing],
          revision: 3,
          missingInputs: [
            { reason: 'missing_dependency', fieldId: FIELD.count, itemId: ITEM.root },
            { reason: 'reference_missing', fieldId: FIELD.price, itemId: ITEM.missing },
          ],
        },
        field(FIELD.ref, refTo(ITEM.missing))
      ),
    ],
  },
  {
    name: 'a computed input without recorded missing inputs names itself',
    expression: coalesce(read(FIELD.upstream), read(FIELD.absent)),
    kind: 'decimal',
    items: [
      root({
        fieldId: FIELD.upstream,
        state: 'unavailable',
        reason: 'evaluation_error',
        failedFieldId: FIELD.upstream,
        traversedItemIds: [ITEM.root],
        revision: 3,
      }),
    ],
  },
  {
    name: 'coalesce does not skip an evaluation error',
    expression: coalesce(bin('divide', read(FIELD.price), lit('0')), lit('1')),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce reaches an error after skipping an unavailable input',
    expression: coalesce(read(FIELD.absent), bin('divide', lit('1'), lit('3'))),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce inside arithmetic',
    expression: bin('add', coalesce(read(FIELD.absent), lit('1.5')), read(FIELD.price)),
    kind: 'decimal',
    items: priced,
  },
  {
    name: 'coalesce with one value is rejected',
    expression: coalesce(lit('1')),
    kind: 'decimal',
  },
  {
    name: 'coalesce without a values array is rejected',
    expression: { op: 'coalesce', values: lit('1') },
    kind: 'decimal',
  },
  {
    name: 'coalesce with an extra key is rejected',
    expression: { op: 'coalesce', values: [lit('1'), lit('2')], left: lit('3') },
    kind: 'decimal',
  },
];
