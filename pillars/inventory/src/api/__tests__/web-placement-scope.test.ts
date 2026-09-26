import { randomUUID } from 'node:crypto';

import { asc, eq, inArray, sql, type SQL } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { items, locations } from '../../db/index.js';
import { MAX_CONTAINMENT_DEPTH } from '../../domain/commands/index.js';
import {
  atEffectiveLocationSql,
  directlyInsideSql,
  effectiveLocationIdSql,
  insideContainerSql,
  readEffectiveLocations,
  readRooms,
  withinLocationSql,
  withinSql,
} from '../web/placement-scope.js';
import {
  createItem,
  createLocation,
  openSyncHarness,
  PROTOCOL,
  send,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

const transport = createTestTransport();
let harness: SyncHarness;

beforeEach(() => {
  harness = openSyncHarness(transport);
});

afterEach(() => harness.close());

async function apply(...mutations: Parameters<typeof send>[1]): Promise<void> {
  const response = await send(harness.api, mutations, PROTOCOL);
  expect(response.status).toBe(200);
  expect(
    response.body.outcomes.every((outcome: { status: string }) => outcome.status === 'applied')
  ).toBe(true);
}

interface PlacementGraph {
  garage: string;
  shelf: string;
  outer: string;
  inner: string;
  nested: string;
  located: string;
  hand: string;
}

async function placementGraph(): Promise<PlacementGraph> {
  const graph = {
    garage: randomUUID(),
    shelf: randomUUID(),
    outer: randomUUID(),
    inner: randomUUID(),
    nested: randomUUID(),
    located: randomUUID(),
    hand: randomUUID(),
  };
  await apply(
    createLocation(graph.garage, 'Garage'),
    createLocation(graph.shelf, 'Shelf', graph.garage),
    createItem(graph.outer, 'Outer box'),
    createItem(graph.inner, 'Inner box'),
    createItem(graph.nested, 'Nested item'),
    createItem(graph.located, 'Located item'),
    createItem(graph.hand, 'In-hand item')
  );

  harness.db.db
    .update(items)
    .set({ isContainer: 1, access: 'open' })
    .where(inArray(items.id, [graph.outer, graph.inner]))
    .run();
  harness.db.db
    .update(items)
    .set({ placementKind: 'location', locationId: graph.shelf, containingItemId: null })
    .where(eq(items.id, graph.outer))
    .run();
  harness.db.db
    .update(items)
    .set({ placementKind: 'container', locationId: null, containingItemId: graph.outer })
    .where(eq(items.id, graph.inner))
    .run();
  harness.db.db
    .update(items)
    .set({ placementKind: 'container', locationId: null, containingItemId: graph.inner })
    .where(eq(items.id, graph.nested))
    .run();
  harness.db.db
    .update(items)
    .set({ placementKind: 'location', locationId: graph.garage, containingItemId: null })
    .where(eq(items.id, graph.located))
    .run();

  return graph;
}

function idsWhere(condition: SQL): string[] {
  return harness.db.db
    .select({ id: items.id })
    .from(items)
    .where(condition)
    .orderBy(asc(items.id))
    .all()
    .map((row) => row.id);
}

describe('web placement scope SQL', () => {
  it('insideContainerSql follows nested boxes and excludes the container itself', async () => {
    const graph = await placementGraph();

    expect(new Set(idsWhere(insideContainerSql(graph.outer)))).toEqual(
      new Set([graph.inner, graph.nested])
    );
    expect(idsWhere(insideContainerSql(graph.outer))).not.toContain(graph.outer);
  });

  it('directlyInsideSql matches only the first level', async () => {
    const graph = await placementGraph();

    expect(idsWhere(directlyInsideSql(graph.outer))).toEqual([graph.inner]);
  });

  it('withinLocationSql includes descendant places and items boxed there', async () => {
    const graph = await placementGraph();

    expect(new Set(idsWhere(withinLocationSql(graph.garage)))).toEqual(
      new Set([graph.outer, graph.inner, graph.nested, graph.located])
    );
    expect(new Set(idsWhere(withinLocationSql(graph.shelf)))).toEqual(
      new Set([graph.outer, graph.inner, graph.nested])
    );
  });

  it('atEffectiveLocationSql matches the exact place only', async () => {
    const graph = await placementGraph();

    expect(new Set(idsWhere(atEffectiveLocationSql(graph.shelf)))).toEqual(
      new Set([graph.outer, graph.inner, graph.nested])
    );
    expect(idsWhere(atEffectiveLocationSql(graph.garage))).toEqual([graph.located]);
  });

  it('effectiveLocationIdSql equals readEffectiveLocations for nested, located and in-hand rows', async () => {
    const graph = await placementGraph();
    const itemIds = [graph.nested, graph.located, graph.hand];

    const selected = harness.db.db
      .select({ id: items.id, at: effectiveLocationIdSql() })
      .from(items)
      .where(inArray(items.id, itemIds))
      .all();
    const selectedLocations = new Map(selected.map((row) => [row.id, row.at]));
    const readLocations = readEffectiveLocations(harness.db.db, itemIds);

    expect(selectedLocations).toEqual(readLocations);
    expect(readLocations).toEqual(
      new Map([
        [graph.nested, graph.shelf],
        [graph.located, graph.garage],
        [graph.hand, null],
      ])
    );
  });

  it('effectiveLocationIdSql orders rows in ORDER BY', async () => {
    const graph = await placementGraph();
    const effective = readEffectiveLocations(harness.db.db, [
      graph.outer,
      graph.inner,
      graph.nested,
      graph.located,
      graph.hand,
    ]);

    const ordered = harness.db.db
      .select({ id: items.id })
      .from(items)
      .orderBy(
        sql`${effectiveLocationIdSql()} IS NULL`,
        asc(effectiveLocationIdSql()),
        asc(items.id)
      )
      .all()
      .map((row) => row.id);
    const expected = [...effective.entries()]
      .toSorted(
        ([leftId, leftLocation], [rightId, rightLocation]) =>
          Number(leftLocation === null) - Number(rightLocation === null) ||
          (leftLocation ?? '').localeCompare(rightLocation ?? '') ||
          leftId.localeCompare(rightId)
      )
      .map(([id]) => id);

    expect(ordered).toEqual(expected);
  });

  it('placement walks follow stored rows without lifecycle or deletion filters', async () => {
    const graph = await placementGraph();
    harness.db.db
      .update(items)
      .set({ lifecycle: 'retired', deletedAt: '2026-09-19T11:00:00.000Z' })
      .where(eq(items.id, graph.inner))
      .run();

    expect(new Set(idsWhere(insideContainerSql(graph.outer)))).toEqual(
      new Set([graph.inner, graph.nested])
    );
    expect(new Set(idsWhere(withinLocationSql(graph.shelf)))).toEqual(
      new Set([graph.outer, graph.inner, graph.nested])
    );
    expect(readEffectiveLocations(harness.db.db, [graph.nested])).toEqual(
      new Map([[graph.nested, graph.shelf]])
    );
  });

  it('withinSql resolves a location, a container, and returns null for a non-container item or unknown id', async () => {
    const graph = await placementGraph();

    const locationScope = withinSql(harness.db.db, graph.garage);
    const containerScope = withinSql(harness.db.db, graph.outer);
    if (locationScope === null || containerScope === null) {
      throw new Error('expected live location and container scopes');
    }
    expect(new Set(idsWhere(locationScope))).toEqual(
      new Set([graph.outer, graph.inner, graph.nested, graph.located])
    );
    expect(new Set(idsWhere(containerScope))).toEqual(new Set([graph.inner, graph.nested]));
    expect(withinSql(harness.db.db, graph.nested)).toBeNull();
    expect(withinSql(harness.db.db, randomUUID())).toBeNull();
  });

  it('withinSql resolves only live locations and active containers', async () => {
    const graph = await placementGraph();

    harness.db.db
      .update(items)
      .set({ lifecycle: 'retired' })
      .where(eq(items.id, graph.outer))
      .run();
    expect(withinSql(harness.db.db, graph.outer)).toBeNull();

    harness.db.db
      .update(items)
      .set({ lifecycle: 'active', deletedAt: '2026-09-19T11:00:00.000Z' })
      .where(eq(items.id, graph.outer))
      .run();
    expect(withinSql(harness.db.db, graph.outer)).toBeNull();

    harness.db.db
      .update(locations)
      .set({ deletedAt: '2026-09-19T11:00:00.000Z' })
      .where(eq(locations.id, graph.garage))
      .run();
    expect(withinSql(harness.db.db, graph.garage)).toBeNull();
  });

  it('readEffectiveLocations is null for an item in a box that is in hand', async () => {
    const graph = await placementGraph();
    harness.db.db
      .update(items)
      .set({ placementKind: 'hand', locationId: null, containingItemId: null })
      .where(eq(items.id, graph.outer))
      .run();

    expect(readEffectiveLocations(harness.db.db, [graph.nested])).toEqual(
      new Map([[graph.nested, null]])
    );
  });

  it("readRooms uses the root's child without a home and the home's child with one", async () => {
    const kitchen = randomUUID();
    const pantry = randomUUID();
    const shelf = randomUUID();
    const house = randomUUID();
    const houseKitchen = randomUUID();
    const housePantry = randomUUID();
    await apply(
      createLocation(kitchen, 'Kitchen'),
      createLocation(pantry, 'Pantry', kitchen),
      createLocation(shelf, 'Shelf', pantry),
      createLocation(house, 'House'),
      createLocation(houseKitchen, 'Kitchen', house),
      createLocation(housePantry, 'Pantry', houseKitchen)
    );

    const withoutHome = readRooms(harness.db.db, [shelf, housePantry]);
    expect(withoutHome.get(shelf)).toEqual({ id: pantry, name: 'Pantry' });
    expect(withoutHome.get(housePantry)).toEqual({ id: houseKitchen, name: 'Kitchen' });

    const withHome = readRooms(harness.db.db, [shelf], kitchen);
    expect(withHome.get(shelf)).toEqual({ id: pantry, name: 'Pantry' });
    expect(readRooms(harness.db.db, [kitchen]).get(kitchen)).toEqual({
      id: kitchen,
      name: 'Kitchen',
    });
    expect(readRooms(harness.db.db, [housePantry], kitchen)).toEqual(new Map());
  });

  it(`caps containment walks at ${MAX_CONTAINMENT_DEPTH} hops`, async () => {
    const root = randomUUID();
    const descendants = Array.from({ length: MAX_CONTAINMENT_DEPTH + 1 }, () => randomUUID());
    await apply(
      createItem(root, 'Root box'),
      ...descendants.map((id, index) => createItem(id, `Nested box ${index + 1}`))
    );

    harness.db.db
      .update(items)
      .set({ isContainer: 1, access: 'open' })
      .where(inArray(items.id, [root, ...descendants]))
      .run();
    for (const [index, id] of descendants.entries()) {
      const containingItemId = index === 0 ? root : descendants[index - 1];
      if (containingItemId === undefined) throw new Error('missing containment parent');
      harness.db.db
        .update(items)
        .set({ placementKind: 'container', locationId: null, containingItemId })
        .where(eq(items.id, id))
        .run();
    }

    expect(new Set(idsWhere(insideContainerSql(root)))).toEqual(
      new Set(descendants.slice(0, MAX_CONTAINMENT_DEPTH))
    );
  });

  it(`caps location walks at ${MAX_CONTAINMENT_DEPTH} hops`, async () => {
    const root = randomUUID();
    const descendants = Array.from({ length: MAX_CONTAINMENT_DEPTH + 1 }, () => randomUUID());
    const atCap = descendants.at(MAX_CONTAINMENT_DEPTH - 1);
    const beyondCap = descendants.at(MAX_CONTAINMENT_DEPTH);
    if (atCap === undefined || beyondCap === undefined) {
      throw new Error('missing location depth boundary');
    }
    const visible = randomUUID();
    const hidden = randomUUID();
    await apply(
      createLocation(root, 'Root'),
      ...descendants.map((id, index) => {
        const parentId = index === 0 ? root : descendants[index - 1];
        if (parentId === undefined) throw new Error('missing location parent');
        return createLocation(id, `Level ${index + 1}`, parentId);
      }),
      createItem(visible, 'At the cap'),
      createItem(hidden, 'Beyond the cap')
    );

    harness.db.db
      .update(items)
      .set({ placementKind: 'location', locationId: atCap, containingItemId: null })
      .where(eq(items.id, visible))
      .run();
    harness.db.db
      .update(items)
      .set({ placementKind: 'location', locationId: beyondCap, containingItemId: null })
      .where(eq(items.id, hidden))
      .run();

    expect(idsWhere(withinLocationSql(root))).toContain(visible);
    expect(idsWhere(withinLocationSql(root))).not.toContain(hidden);
  });

  it('a containment cycle in the data terminates', async () => {
    const graph = await placementGraph();
    harness.db.db
      .update(items)
      .set({ placementKind: 'container', locationId: null, containingItemId: graph.inner })
      .where(eq(items.id, graph.outer))
      .run();
    harness.db.db
      .update(items)
      .set({ placementKind: 'container', locationId: null, containingItemId: graph.outer })
      .where(eq(items.id, graph.inner))
      .run();

    expect(new Set(idsWhere(insideContainerSql(graph.outer)))).toEqual(
      new Set([graph.inner, graph.nested])
    );
    expect(idsWhere(insideContainerSql(graph.outer))).not.toContain(graph.outer);
    expect(readEffectiveLocations(harness.db.db, [graph.outer, graph.inner])).toEqual(
      new Map([
        [graph.outer, null],
        [graph.inner, null],
      ])
    );
  });
});
