/**
 * Item-op cases, part 1: the A3 ops (`item.move`, `item.setAccess`,
 * `item.setFull`, `item.setLifecycle`, `item.restoreDeleted`,
 * `event.revert`) and `item.create`, `item.edit`, `item.changeType`. Split
 * out of `command-vector-cases.ts` to stay under the file line budget; the
 * rest of the item-op cases are in `command-vector-cases-items-2.ts`, and
 * `command-vectors.ts` concatenates every case file together.
 */
import { VECTOR_CLOCK, type CommandVectorCase } from './command-vector-fixture.js';
import { ITEM_CRATE, ITEM_LAMP, LOC_HOUSE } from './command-vector-ids.js';

/** Every registered item op gets at least one vector, an `applied` case exercising its primary field change. */
export const ITEM_COMMAND_VECTOR_CASES: readonly CommandVectorCase[] = [
  {
    name: 'item.move-to-location',
    op: 'item.move',
    seedLocations: [{ id: LOC_HOUSE, name: 'House' }],
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000001',
      op: 'item.move',
      entityId: ITEM_LAMP,
      baseRevision: 1,
      dependsOn: [],
      args: { to: { kind: 'location', locationId: LOC_HOUSE }, verb: 'move' },
    },
  },
  {
    name: 'item.setAccess-close',
    op: 'item.setAccess',
    seedItems: [{ id: ITEM_CRATE, name: 'Crate', placement: { kind: 'hand' }, isContainer: true }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000002',
      op: 'item.setAccess',
      entityId: ITEM_CRATE,
      baseRevision: 1,
      dependsOn: [],
      args: { access: 'closed' },
    },
  },
  {
    name: 'item.setFull-true',
    op: 'item.setFull',
    seedItems: [{ id: ITEM_CRATE, name: 'Crate', placement: { kind: 'hand' }, isContainer: true }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000003',
      op: 'item.setFull',
      entityId: ITEM_CRATE,
      baseRevision: 1,
      dependsOn: [],
      args: { full: true },
    },
  },
  {
    name: 'item.setLifecycle-discard',
    op: 'item.setLifecycle',
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000004',
      op: 'item.setLifecycle',
      entityId: ITEM_LAMP,
      baseRevision: 1,
      dependsOn: [],
      args: { lifecycle: 'discarded', reason: 'broken' },
    },
  },
  {
    name: 'item.restoreDeleted',
    op: 'item.restoreDeleted',
    seedItems: [
      { id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' }, deletedAt: VECTOR_CLOCK },
    ],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000005',
      op: 'item.restoreDeleted',
      entityId: ITEM_LAMP,
      baseRevision: null,
      dependsOn: [],
      args: {},
    },
  },
  {
    name: 'event.revert-move',
    op: 'event.revert',
    seedLocations: [{ id: LOC_HOUSE, name: 'House' }],
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    pre: [
      {
        mutationId: '30000000-0000-4000-8000-0000000000ff',
        op: 'item.move',
        entityId: ITEM_LAMP,
        baseRevision: 1,
        dependsOn: [],
        args: { to: { kind: 'location', locationId: LOC_HOUSE }, verb: 'move' },
      },
    ],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000006',
      op: 'event.revert',
      entityId: ITEM_LAMP,
      baseRevision: null,
      dependsOn: [],
      args: { seq: 1 },
    },
  },
  {
    name: 'item.create-untyped-in-hand',
    op: 'item.create',
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000007',
      op: 'item.create',
      entityId: ITEM_LAMP,
      baseRevision: null,
      dependsOn: [],
      args: { item: { name: 'Lamp', placement: { kind: 'hand' } } },
    },
  },
  {
    name: 'item.create-with-code',
    op: 'item.create',
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000017',
      op: 'item.create',
      entityId: ITEM_LAMP,
      baseRevision: null,
      dependsOn: [],
      args: { item: { name: 'Lamp', placement: { kind: 'hand' } }, code: 'B412' },
    },
  },
  {
    name: 'item.edit-name',
    op: 'item.edit',
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000008',
      op: 'item.edit',
      entityId: ITEM_LAMP,
      baseRevision: 1,
      dependsOn: [],
      args: { name: 'Reading lamp' },
    },
  },
  {
    name: 'item.changeType-to-bulb',
    op: 'item.changeType',
    seedItems: [{ id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'hand' } }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000009',
      op: 'item.changeType',
      entityId: ITEM_LAMP,
      baseRevision: 1,
      dependsOn: [],
      args: { typeKey: 'bulb', fields: { Fitting: 'E27' } },
    },
  },
];
