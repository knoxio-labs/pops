/**
 * Item-op cases, part 2: `item.setCode`, `item.setQuantity`, `item.split`
 * and the photo ops (`item.attachPhoto`, `item.removePhoto`,
 * `item.reorderPhotos`). See `command-vector-cases-items.ts` for part 1.
 */
import { type CommandVectorCase } from './command-vector-fixture.js';
import { HASH_A, ITEM_LAMP, ITEM_TOASTER } from './command-vector-ids.js';

/** Part 2 of the item-op cases; concatenated with part 1 by `command-vector-cases.ts`. */
export const ITEM_COMMAND_VECTOR_CASES_2: readonly CommandVectorCase[] = [
  {
    name: 'item.setCode',
    op: 'item.setCode',
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-00000000000a',
      op: 'item.setCode',
      entityId: ITEM_LAMP,
      baseRevision: 1,
      dependsOn: [],
      args: { code: 'B412' },
    },
  },
  {
    name: 'item.setQuantity',
    op: 'item.setQuantity',
    seedItems: [{ id: ITEM_LAMP, name: 'Screws', placement: { kind: 'hand' }, quantity: 1 }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-00000000000b',
      op: 'item.setQuantity',
      entityId: ITEM_LAMP,
      baseRevision: 1,
      dependsOn: [],
      args: { quantity: 40 },
    },
  },
  {
    name: 'item.split',
    op: 'item.split',
    seedItems: [{ id: ITEM_LAMP, name: 'Screws', placement: { kind: 'hand' }, quantity: 40 }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-00000000000c',
      op: 'item.split',
      entityId: ITEM_LAMP,
      baseRevision: 1,
      dependsOn: [],
      args: { newItemId: ITEM_TOASTER, quantity: 10 },
    },
  },
  {
    name: 'item.attachPhoto',
    op: 'item.attachPhoto',
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    seedMedia: [HASH_A],
    mutation: {
      mutationId: '30000000-0000-4000-8000-00000000000d',
      op: 'item.attachPhoto',
      entityId: ITEM_LAMP,
      baseRevision: null,
      dependsOn: [],
      args: { sha256: HASH_A, position: 0 },
    },
  },
  {
    name: 'item.removePhoto',
    op: 'item.removePhoto',
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    seedMedia: [HASH_A],
    pre: [
      {
        mutationId: '30000000-0000-4000-8000-0000000000fe',
        op: 'item.attachPhoto',
        entityId: ITEM_LAMP,
        baseRevision: null,
        dependsOn: [],
        args: { sha256: HASH_A, position: 0 },
      },
    ],
    mutation: {
      mutationId: '30000000-0000-4000-8000-00000000000e',
      op: 'item.removePhoto',
      entityId: ITEM_LAMP,
      baseRevision: null,
      dependsOn: [],
      args: { sha256: HASH_A },
    },
  },
  {
    name: 'item.reorderPhotos',
    op: 'item.reorderPhotos',
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    seedMedia: [HASH_A],
    pre: [
      {
        mutationId: '30000000-0000-4000-8000-0000000000fd',
        op: 'item.attachPhoto',
        entityId: ITEM_LAMP,
        baseRevision: null,
        dependsOn: [],
        args: { sha256: HASH_A, position: 0 },
      },
    ],
    mutation: {
      mutationId: '30000000-0000-4000-8000-00000000000f',
      op: 'item.reorderPhotos',
      entityId: ITEM_LAMP,
      baseRevision: null,
      dependsOn: [],
      args: { sha256s: [HASH_A] },
    },
  },
];
