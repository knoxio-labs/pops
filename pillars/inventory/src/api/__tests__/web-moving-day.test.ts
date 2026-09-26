import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WebMovingResponseSchema } from '../../contract/rest-web-moving.js';
import {
  catalogueRevisions,
  fieldEnumOptions,
  itemFieldValues,
  itemTypeFields,
  itemTypes,
  items,
} from '../../db/index.js';
import {
  createItem,
  createLocation,
  openSyncHarness,
  send,
  type SyncHarness,
  type wireMutation,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let harness: SyncHarness;

beforeEach(() => {
  harness = openSyncHarness(transport);
});

afterEach(() => harness.close());

async function apply(...mutations: ReturnType<typeof wireMutation>[]): Promise<void> {
  const response = await send(harness.api, mutations);
  expect(response.status).toBe(200);
  expect(
    response.body.outcomes.every((outcome: { status: string }) => outcome.status === 'applied')
  ).toBe(true);
}

async function moving(query: Record<string, string> = {}) {
  const response = await harness.api.get('/web/moving-day').query(query);
  expect(response.status).toBe(200);
  return WebMovingResponseSchema.parse(response.body);
}

function setBoxState(id: string, access: 'open' | 'closed', full = false): void {
  harness.db.db
    .update(items)
    .set({ isContainer: 1, access, isFull: full ? 1 : 0 })
    .where(eq(items.id, id))
    .run();
}

function setLifecycle(id: string, lifecycle: 'active' | 'retired'): void {
  harness.db.db.update(items).set({ lifecycle }).where(eq(items.id, id)).run();
}

interface DestinationFixture {
  typeId: string;
  fieldId: string;
  options: { storage: string; parents: string };
}

function installDestinationCatalogue(fieldKey = 'Destination'): DestinationFixture {
  const typeId = randomUUID();
  const fieldId = randomUUID();
  const storage = randomUUID();
  const parents = randomUUID();
  const createdAt = '2026-09-19T00:00:00.000Z';

  harness.db.db
    .insert(catalogueRevisions)
    .values({
      revision: 2,
      baseRevision: 1,
      status: 'draft',
      minimumProtocol: 2,
      createdActorKind: 'web',
      createdAt,
    })
    .run();
  harness.db.db
    .insert(itemTypes)
    .values({
      revision: 2,
      id: typeId,
      key: 'moving-box',
      label: 'Moving box',
      sortOrder: 0,
      capabilitiesJson: JSON.stringify(['containment']),
      legacyLabelsJson: JSON.stringify([]),
      presentationJson: JSON.stringify({}),
    })
    .run();
  harness.db.db
    .insert(itemTypeFields)
    .values({
      revision: 2,
      id: fieldId,
      typeId,
      key: fieldKey,
      label: fieldKey,
      sortOrder: 0,
      kind: 'enum',
      cardinality: 'one',
      required: 0,
      storage: 'stored',
      referenceKindsJson: JSON.stringify([]),
      referenceTypeIdsJson: JSON.stringify([]),
      allowOverride: 0,
      presentationJson: JSON.stringify({}),
    })
    .run();
  harness.db.db
    .insert(fieldEnumOptions)
    .values([
      { revision: 2, id: storage, fieldId, key: 'storage', label: 'Storage', sortOrder: 0 },
      {
        revision: 2,
        id: parents,
        fieldId,
        key: 'parents',
        label: "Parents' house",
        sortOrder: 1,
      },
    ])
    .run();
  harness.db.db
    .update(catalogueRevisions)
    .set({ status: 'published', publishedActorKind: 'web', publishedAt: createdAt })
    .where(eq(catalogueRevisions.revision, 2))
    .run();
  return { typeId, fieldId, options: { storage, parents } };
}

function setBoxType(id: string, typeId: string): void {
  harness.db.db.update(items).set({ typeId, isContainer: 1 }).where(eq(items.id, id)).run();
}

function setContainerPlacement(id: string, containerId: string): void {
  harness.db.db
    .update(items)
    .set({ placementKind: 'container', locationId: null, containingItemId: containerId })
    .where(eq(items.id, id))
    .run();
}

function setDestination(id: string, fieldId: string, optionId: string): void {
  harness.db.db
    .insert(itemFieldValues)
    .values({
      itemId: id,
      fieldId,
      source: 'stored',
      ordinal: 0,
      valueJson: JSON.stringify({ optionId }),
      catalogueRevision: 2,
      createdAt: '2026-09-19T00:00:00.000Z',
      updatedAt: '2026-09-19T00:00:00.000Z',
    })
    .run();
}

describe('GET /web/moving-day', () => {
  it('stages a box as packing, full or closed', async () => {
    const packing = randomUUID();
    const full = randomUUID();
    const closed = randomUUID();
    await apply(
      createItem(packing, 'Box 10'),
      createItem(full, 'Box 2'),
      createItem(closed, 'Box 1')
    );
    setBoxState(packing, 'open');
    setBoxState(full, 'open', true);
    setBoxState(closed, 'closed', true);

    const result = await moving();

    expect(result.boxes.map((box) => box.id)).toEqual([closed, full, packing]);
    expect(result.boxes.map((box) => box.stage)).toEqual(['closed', 'full', 'packing']);
    expect(result.stages).toEqual({ packing: 1, full: 1, closed: 1 });
  });

  it('a box with no destination value has destination null', async () => {
    const fixture = installDestinationCatalogue();
    const boxId = randomUUID();
    await apply(createItem(boxId, 'Undecided box'));
    setBoxState(boxId, 'open');
    setBoxType(boxId, fixture.typeId);

    const result = await moving();

    expect(result.boxes[0]?.destination).toBeNull();
  });

  it("destination reads the enum option label from the box's type field", async () => {
    const fixture = installDestinationCatalogue();
    const boxId = randomUUID();
    await apply(createItem(boxId, 'Parents box'));
    setBoxState(boxId, 'open');
    setBoxType(boxId, fixture.typeId);
    setDestination(boxId, fixture.fieldId, fixture.options.parents);

    const result = await moving();

    expect(result.boxes[0]?.destination).toEqual({
      optionKey: 'parents',
      label: "Parents' house",
    });
    expect(result.destinationOptions).toEqual([
      { optionKey: 'storage', label: 'Storage' },
      { optionKey: 'parents', label: "Parents' house" },
    ]);
  });

  it("destination reads the Destination enum field whatever the key's case", async () => {
    const fixture = installDestinationCatalogue('dEsTiNaTiOn');
    const boxId = randomUUID();
    await apply(createItem(boxId, 'Storage box'));
    setBoxState(boxId, 'open');
    setBoxType(boxId, fixture.typeId);
    setDestination(boxId, fixture.fieldId, fixture.options.storage);

    const result = await moving({ destinationField: ' DESTINATION ' });

    expect(result.boxes[0]?.destination).toEqual({
      optionKey: 'storage',
      label: 'Storage',
    });
  });

  it('contents follow nested boxes and name the direct container', async () => {
    const outer = randomUUID();
    const inner = randomUUID();
    const nestedThing = randomUUID();
    await apply(
      createItem(outer, 'Outer box'),
      createItem(inner, 'Inner box'),
      createItem(nestedThing, 'Nested thing')
    );
    setBoxState(outer, 'closed');
    setBoxState(inner, 'open');
    setContainerPlacement(inner, outer);
    setContainerPlacement(nestedThing, inner);

    const result = await moving();
    const outerContents = result.boxes.find((box) => box.id === outer)?.contents;

    expect(outerContents).toEqual([
      { id: inner, name: 'Inner box', code: null, containerId: outer },
      { id: nestedThing, name: 'Nested thing', code: null, containerId: inner },
    ]);
    expect(result.boxes.find((box) => box.id === outer)?.count).toBe(2);
  });

  it('a thing inside a box is packed, not loose', async () => {
    const room = randomUUID();
    const boxId = randomUUID();
    const thingId = randomUUID();
    await apply(
      createLocation(room, 'Kitchen'),
      createItem(boxId, 'Kitchen box', { kind: 'location', locationId: room }),
      createItem(thingId, 'Packed thing')
    );
    setBoxState(boxId, 'open');
    setContainerPlacement(thingId, boxId);

    const result = await moving();

    expect(result.packed).toBe(1);
    expect(result.looseCount).toBe(0);
    expect(result.inHand).toEqual([]);
  });

  it('in-hand things are counted separately from loose and packed things', async () => {
    const room = randomUUID();
    const boxId = randomUUID();
    const packedId = randomUUID();
    const looseId = randomUUID();
    const inHandId = randomUUID();
    await apply(
      createLocation(room, 'Kitchen'),
      createItem(boxId, 'Kitchen box', { kind: 'location', locationId: room }),
      createItem(packedId, 'Packed thing'),
      createItem(looseId, 'Loose thing', { kind: 'location', locationId: room }),
      createItem(inHandId, 'Thing in hand', { kind: 'hand' })
    );
    setBoxState(boxId, 'open');
    setContainerPlacement(packedId, boxId);

    const result = await moving();

    expect(result.packed).toBe(1);
    expect(result.looseCount).toBe(1);
    expect(result.inHand).toEqual([{ id: inHandId, name: 'Thing in hand', code: null }]);
  });

  it('loose groups by room under the home and leaves out other places', async () => {
    const home = randomUUID();
    const kitchen = randomUUID();
    const pantry = randomUUID();
    const garage = randomUUID();
    const kitchenThing = randomUUID();
    const garageThing = randomUUID();
    await apply(
      createLocation(home, 'House'),
      createLocation(kitchen, 'Kitchen', home),
      createLocation(pantry, 'Pantry', kitchen),
      createLocation(garage, 'Garage'),
      createItem(kitchenThing, 'Loose in kitchen', { kind: 'location', locationId: pantry }),
      createItem(garageThing, 'Outside home', { kind: 'location', locationId: garage })
    );

    const result = await moving({ homeLocationId: home });

    expect(result.loose).toEqual([
      {
        room: { id: kitchen, name: 'Kitchen' },
        items: [{ id: kitchenThing, name: 'Loose in kitchen', code: null }],
      },
    ]);
    expect(result.looseCount).toBe(1);
  });

  it('without homeLocationId every root is a home', async () => {
    const house = randomUUID();
    const kitchen = randomUUID();
    const pantry = randomUUID();
    const thingId = randomUUID();
    await apply(
      createLocation(house, 'House'),
      createLocation(kitchen, 'Kitchen', house),
      createLocation(pantry, 'Pantry', kitchen),
      createItem(thingId, 'Loose pantry thing', { kind: 'location', locationId: pantry })
    );

    const result = await moving();

    expect(result.loose).toEqual([
      {
        room: { id: kitchen, name: 'Kitchen' },
        items: [{ id: thingId, name: 'Loose pantry thing', code: null }],
      },
    ]);
  });

  it('a retired box is excluded', async () => {
    const active = randomUUID();
    const retired = randomUUID();
    await apply(createItem(active, 'Active box'), createItem(retired, 'Retired box'));
    setBoxState(active, 'open');
    setBoxState(retired, 'closed');
    setLifecycle(retired, 'retired');

    const result = await moving();

    expect(result.boxes.map((box) => box.id)).toEqual([active]);
    expect(result.unlabelledClosed).toBe(0);
  });

  it('unlabelledClosed counts closed boxes with no code', async () => {
    const unlabelled = randomUUID();
    const labelled = randomUUID();
    await apply(
      createItem(unlabelled, 'No label'),
      createItem(labelled, 'Labelled', { kind: 'hand' })
    );
    setBoxState(unlabelled, 'closed');
    setBoxState(labelled, 'closed');
    harness.db.db.update(items).set({ code: 'BOX-1' }).where(eq(items.id, labelled)).run();

    const result = await moving();

    expect(result.unlabelledClosed).toBe(1);
  });

  it('no containers returns no boxes and still reports loose things', async () => {
    const room = randomUUID();
    const looseThing = randomUUID();
    await apply(
      createLocation(room, 'Kitchen'),
      createItem(looseThing, 'Loose thing', { kind: 'location', locationId: room })
    );

    const result = await moving();

    expect(result.boxes).toEqual([]);
    expect(result.stages).toEqual({ packing: 0, full: 0, closed: 0 });
    expect(result.looseCount).toBe(1);
    expect(result.loose).toEqual([
      {
        room: { id: room, name: 'Kitchen' },
        items: [{ id: looseThing, name: 'Loose thing', code: null }],
      },
    ]);
  });

  it('every box closed and nothing loose reads as done', async () => {
    const room = randomUUID();
    const boxId = randomUUID();
    await apply(
      createLocation(room, 'Kitchen'),
      createItem(boxId, 'Closed box', { kind: 'location', locationId: room })
    );
    setBoxState(boxId, 'closed');

    const result = await moving({ homeLocationId: room });

    expect(result.stages.closed).toBe(result.boxes.length);
    expect(result.looseCount).toBe(0);
  });

  it('an unknown homeLocationId is a 400', async () => {
    const response = await harness.api
      .get('/web/moving-day')
      .query({ homeLocationId: randomUUID() });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ code: 'ValidationError' });
  });

  it('an empty destinationField is a 400', async () => {
    const response = await harness.api.get('/web/moving-day').query({ destinationField: '   ' });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({ name: 'ValidationError' });
  });
});
