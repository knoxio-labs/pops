import { FIELD, ITEM, absentItem, bin, field, item, read, refTo, root } from './fixture.js';

import type { ExpressionVectorCase } from './fixture.js';

const upstreamDependency = { itemId: ITEM.b, fieldId: FIELD.price, revision: 9 } as const;

/** Same-item reads, computed-of-computed propagation and bounded reference traversal. */
export const READ_CASES: readonly ExpressionVectorCase[] = [
  {
    name: 'same-item read',
    expression: read(FIELD.price),
    kind: 'decimal',
    items: [root(field(FIELD.price, '4.00'))],
  },
  {
    name: 'same-item read of an absent field is missing_dependency',
    expression: read(FIELD.absent),
    kind: 'decimal',
    items: [root(field(FIELD.price, '4.00'))],
  },
  {
    name: 'reading a computed field carries its dependencies',
    expression: read(FIELD.upstream),
    kind: 'decimal',
    items: [root(field(FIELD.upstream, '7.25', 3, [upstreamDependency]))],
  },
  {
    name: 'an unavailable computed dependency propagates its reason unchanged',
    expression: read(FIELD.upstream),
    kind: 'decimal',
    items: [
      root({
        fieldId: FIELD.upstream,
        state: 'unavailable',
        reason: 'reference_deleted',
        failedFieldId: FIELD.price,
        traversedItemIds: [ITEM.root, ITEM.deleted],
        revision: 3,
        dependencies: [upstreamDependency],
      }),
    ],
  },
  {
    name: 'dependencies are deduplicated and sorted by item then field',
    expression: bin('add', read(FIELD.price), bin('add', read(FIELD.count), read(FIELD.price))),
    kind: 'decimal',
    items: [root(field(FIELD.count, '2'), field(FIELD.price, '0.5'))],
  },
  {
    name: 'one reference hop',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [
      root(field(FIELD.ref, refTo(ITEM.a))),
      item(ITEM.a, [field(FIELD.price, '3.10', 5)], 5),
    ],
  },
  {
    name: 'two reference hops reach the traversal limit',
    expression: read(FIELD.price, [FIELD.ref, FIELD.ref]),
    kind: 'decimal',
    items: [
      root(field(FIELD.ref, refTo(ITEM.a))),
      item(ITEM.a, [field(FIELD.ref, refTo(ITEM.b), 5)], 5),
      item(ITEM.b, [field(FIELD.price, '8', 7)], 7),
    ],
  },
  {
    name: 'a reference cycle back to the root is read, not rejected',
    expression: read(FIELD.price, [FIELD.ref, FIELD.ref]),
    kind: 'decimal',
    items: [
      root(field(FIELD.ref, refTo(ITEM.a)), field(FIELD.price, '1.25')),
      item(ITEM.a, [field(FIELD.ref, refTo(ITEM.root), 5)], 5),
    ],
  },
  {
    name: 'a self reference',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [root(field(FIELD.ref, refTo(ITEM.root)), field(FIELD.price, '6'))],
  },
  {
    name: 'an absent reference field is missing_dependency',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
  },
  {
    name: 'a missing target is reference_missing',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [root(field(FIELD.ref, refTo(ITEM.missing)))],
  },
  {
    name: 'a deleted target is reference_deleted',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [root(field(FIELD.ref, refTo(ITEM.deleted))), absentItem(ITEM.deleted, 'deleted')],
  },
  {
    name: 'an unresolved target is reference_unresolved',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [
      root(field(FIELD.ref, refTo(ITEM.unresolved))),
      absentItem(ITEM.unresolved, 'unresolved'),
    ],
  },
  {
    name: 'a deleted intermediate item fails at the next reference field',
    expression: read(FIELD.price, [FIELD.ref, FIELD.ref]),
    kind: 'decimal',
    items: [root(field(FIELD.ref, refTo(ITEM.deleted))), absentItem(ITEM.deleted, 'deleted')],
  },
  {
    name: 'the target lacks the read field',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [root(field(FIELD.ref, refTo(ITEM.a))), item(ITEM.a, [], 5)],
  },
  {
    name: 'traversing a location reference is an evaluation error',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [root(field(FIELD.ref, refTo(ITEM.location, 'location')))],
  },
  {
    name: 'traversing a non-reference value is an evaluation error',
    expression: read(FIELD.price, [FIELD.name]),
    kind: 'decimal',
    items: [root(field(FIELD.name, 'Box'))],
  },
  {
    name: 'an unavailable reference field propagates through the hop',
    expression: read(FIELD.price, [FIELD.ref]),
    kind: 'decimal',
    items: [
      root({
        fieldId: FIELD.ref,
        state: 'unavailable',
        reason: 'missing_dependency',
        failedFieldId: FIELD.absent,
        traversedItemIds: [ITEM.root],
        revision: 3,
      }),
    ],
  },
];
