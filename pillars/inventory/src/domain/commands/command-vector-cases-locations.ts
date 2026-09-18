/**
 * Location-op cases: `location.create`, `location.rename`, `location.move`
 * and `location.delete`. Split out of `command-vector-cases.ts` to stay
 * under the file line budget; `command-vectors.ts` concatenates this with
 * the item-op cases.
 */
import { type CommandVectorCase } from './command-vector-fixture.js';
import { ITEM_LAMP, LOC_GARAGE, LOC_HOUSE } from './command-vector-ids.js';

/** Every registered location op gets at least one vector, an `applied` case exercising its primary field change. */
export const LOCATION_COMMAND_VECTOR_CASES: readonly CommandVectorCase[] = [
  {
    name: 'location.create-under-parent',
    op: 'location.create',
    seedLocations: [{ id: LOC_HOUSE, name: 'House' }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000010',
      op: 'location.create',
      entityId: LOC_GARAGE,
      baseRevision: null,
      dependsOn: [],
      args: { name: 'Garage', parentId: LOC_HOUSE },
    },
  },
  {
    name: 'location.rename',
    op: 'location.rename',
    seedLocations: [{ id: LOC_HOUSE, name: 'House' }],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000011',
      op: 'location.rename',
      entityId: LOC_HOUSE,
      baseRevision: 1,
      dependsOn: [],
      args: { name: 'The house' },
    },
  },
  {
    name: 'location.move',
    op: 'location.move',
    seedLocations: [
      { id: LOC_HOUSE, name: 'House' },
      { id: LOC_GARAGE, name: 'Garage' },
    ],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000012',
      op: 'location.move',
      entityId: LOC_GARAGE,
      baseRevision: 1,
      dependsOn: [],
      args: { parentId: LOC_HOUSE },
    },
  },
  {
    name: 'location.delete-root',
    op: 'location.delete',
    seedLocations: [{ id: LOC_HOUSE, name: 'House' }],
    seedItems: [
      { id: ITEM_LAMP, name: 'Lamp', placement: { kind: 'location', locationId: LOC_HOUSE } },
    ],
    mutation: {
      mutationId: '30000000-0000-4000-8000-000000000013',
      op: 'location.delete',
      entityId: LOC_HOUSE,
      baseRevision: 1,
      dependsOn: [],
      args: {},
    },
  },
];
