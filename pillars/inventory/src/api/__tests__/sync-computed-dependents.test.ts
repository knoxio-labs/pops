/**
 * Items whose computed values read another item are re-sent through the
 * change feed when that item changes: same revision, a newer `seq`, and an
 * evaluation whose dependency revisions match the item that changed.
 */
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  publishReferenceComputedTypes,
  type ReferenceComputedCatalogue,
} from '../../catalogue/__tests__/computed-reference-fixture.js';
import { SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import { runMutation } from '../../domain/commands/index.js';
import {
  openSyncHarness,
  PROTOCOL,
  send,
  wireMutation,
  type SyncHarness,
  type WireMutation,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { z } from 'zod';

type SyncItem = z.infer<typeof SyncItemSchema>;

const transport = createTestTransport();
let h: SyncHarness | undefined;

afterEach(() => {
  h?.close();
  h = undefined;
});

interface Fixture {
  readonly target: SyncHarness;
  readonly catalogue: ReferenceComputedCatalogue;
  readonly partId: string;
  readonly kitId: string;
  readonly bundleId: string;
}

async function apply(target: SyncHarness, mutation: WireMutation): Promise<void> {
  const response = await send(target.api, [mutation]);
  expect(response.status).toBe(200);
  expect(response.body.outcomes[0]).toMatchObject({ status: 'applied' });
}

function ref(targetId: string) {
  return { targetKind: 'item', targetId };
}

function create(
  catalogue: ReferenceComputedCatalogue,
  id: string,
  name: string,
  typeId: string,
  values: { fieldId: string; values: unknown[] }[]
): WireMutation {
  return wireMutation(
    'item.create',
    id,
    { item: { name, typeId, values } },
    { catalogueRevision: catalogue.revision }
  );
}

function edit(
  fixture: Pick<Fixture, 'catalogue'>,
  id: string,
  baseRevision: number,
  values: { fieldId: string; values: unknown[] }[]
): WireMutation {
  return wireMutation(
    'item.edit',
    id,
    { values },
    { baseRevision, catalogueRevision: fixture.catalogue.revision }
  );
}

async function createPart(target: SyncHarness, c: ReferenceComputedCatalogue, weight: number) {
  const id = randomUUID();
  await apply(
    target,
    create(c, id, `Part ${weight}`, c.partTypeId, [{ fieldId: c.weightFieldId, values: [weight] }])
  );
  return id;
}

async function createKit(target: SyncHarness, c: ReferenceComputedCatalogue, partId: string) {
  const id = randomUUID();
  await apply(
    target,
    create(c, id, 'Kit', c.kitTypeId, [{ fieldId: c.kitPartFieldId, values: [ref(partId)] }])
  );
  return id;
}

async function setup(): Promise<Fixture> {
  h = openSyncHarness(transport);
  const catalogue = publishReferenceComputedTypes(h.db.db);
  const partId = await createPart(h, catalogue, 5);
  const kitId = await createKit(h, catalogue, partId);
  const bundleId = randomUUID();
  await apply(
    h,
    create(catalogue, bundleId, 'Bundle', catalogue.bundleTypeId, [
      { fieldId: catalogue.bundleKitFieldId, values: [ref(kitId)] },
    ])
  );
  return { target: h, catalogue, partId, kitId, bundleId };
}

interface Feed {
  readonly items: SyncItem[];
  readonly events: { seq: number; entityId: string }[];
}

async function epochOf(target: SyncHarness): Promise<string> {
  const response = await target.api.get('/sync/snapshot').set(PROTOCOL).query({ limit: 1 });
  expect(response.status).toBe(200);
  return String(response.body.epoch);
}

async function highWater(target: SyncHarness): Promise<number> {
  const response = await target.api.get('/sync/snapshot').set(PROTOCOL).query({ limit: 1 });
  return Number(response.body.highWaterSeq);
}

async function changesSince(target: SyncHarness, since: number): Promise<Feed> {
  const response = await target.api
    .get('/sync/changes')
    .set(PROTOCOL)
    .query({ since, epoch: await epochOf(target), limit: 500 });
  expect(response.status).toBe(200);
  return {
    items: SyncItemSchema.array().parse(response.body.items),
    events: response.body.events as Feed['events'],
  };
}

function row(feed: Feed, id: string): SyncItem {
  const found = feed.items.find((item) => item.id === id);
  if (found === undefined) throw new Error(`feed lacks ${id}`);
  return found;
}

function computed(item: SyncItem, fieldId: string) {
  const value = item.computedValues.find((entry) => entry.fieldId === fieldId);
  if (value === undefined) throw new Error(`${item.id} has no computed ${fieldId}`);
  return value;
}

function dependencyRevision(item: SyncItem, fieldId: string, itemId: string): number | undefined {
  return computed(item, fieldId).dependencies.find((entry) => entry.itemId === itemId)?.revision;
}

function dependentsOf(target: SyncHarness, itemId: string): string[] {
  return target.db.raw
    .prepare(
      'SELECT dependent_item_id AS id FROM item_computed_dependencies WHERE dependency_item_id = ? ORDER BY id'
    )
    .all(itemId)
    .map((entry) => String((entry as { id: string }).id));
}

describe('re-sending computed dependents', () => {
  it('re-sends direct and transitive dependents with a fresh evaluation and unchanged revisions', async () => {
    const f = await setup();
    const since = await highWater(f.target);

    await apply(
      f.target,
      edit(f, f.partId, 1, [{ fieldId: f.catalogue.weightFieldId, values: [7] }])
    );

    const feed = await changesSince(f.target, since);
    const part = row(feed, f.partId);
    const kit = row(feed, f.kitId);
    const bundle = row(feed, f.bundleId);
    expect(part.revision).toBe(2);
    expect(feed.events.map((event) => event.entityId)).toEqual([f.partId]);
    expect(kit).toMatchObject({ revision: 1, seq: part.seq });
    expect(bundle).toMatchObject({ revision: 1, seq: part.seq });
    expect(computed(kit, f.catalogue.kitWeightFieldId)).toMatchObject({
      state: 'ok',
      values: [14],
    });
    expect(dependencyRevision(kit, f.catalogue.kitWeightFieldId, f.partId)).toBe(2);
    expect(computed(bundle, f.catalogue.twoHopFieldId)).toMatchObject({
      state: 'ok',
      values: [21],
    });
    expect(dependencyRevision(bundle, f.catalogue.twoHopFieldId, f.partId)).toBe(2);
    expect(computed(bundle, f.catalogue.viaKitFieldId)).toMatchObject({
      state: 'ok',
      values: [15],
    });
    expect(dependencyRevision(bundle, f.catalogue.viaKitFieldId, f.partId)).toBe(2);
  });

  it('re-sends dependents of a deleted dependency as unavailable, and again on restore', async () => {
    const f = await setup();
    const beforeDelete = await highWater(f.target);

    await apply(f.target, wireMutation('item.delete', f.partId, {}, { baseRevision: 1 }));

    const deleted = await changesSince(f.target, beforeDelete);
    expect(computed(row(deleted, f.kitId), f.catalogue.kitWeightFieldId)).toMatchObject({
      state: 'unavailable',
      reason: 'reference_deleted',
    });
    expect(computed(row(deleted, f.bundleId), f.catalogue.twoHopFieldId)).toMatchObject({
      state: 'unavailable',
      reason: 'reference_deleted',
    });

    const beforeRestore = await highWater(f.target);
    await apply(f.target, wireMutation('item.restoreDeleted', f.partId, {}));

    const restored = await changesSince(f.target, beforeRestore);
    expect(computed(row(restored, f.kitId), f.catalogue.kitWeightFieldId)).toMatchObject({
      state: 'ok',
      values: [10],
    });
  });

  it('re-sends nothing for an item no computed value reads', async () => {
    const f = await setup();
    const loose = await createPart(f.target, f.catalogue, 1);
    const since = await highWater(f.target);

    await apply(f.target, edit(f, loose, 1, [{ fieldId: f.catalogue.weightFieldId, values: [2] }]));

    const feed = await changesSince(f.target, since);
    expect(feed.items.map((item) => item.id)).toEqual([loose]);
  });

  it('keeps an override on the dependent while re-sending it', async () => {
    const f = await setup();
    await apply(
      f.target,
      wireMutation(
        'item.setOverride',
        f.bundleId,
        { fieldId: f.catalogue.viaKitFieldId, values: [99] },
        { baseRevision: 1, catalogueRevision: f.catalogue.revision }
      )
    );
    const since = await highWater(f.target);

    await apply(
      f.target,
      edit(f, f.partId, 1, [{ fieldId: f.catalogue.weightFieldId, values: [7] }])
    );

    const bundle = row(await changesSince(f.target, since), f.bundleId);
    expect(bundle.revision).toBe(2);
    expect(computed(bundle, f.catalogue.viaKitFieldId)).toMatchObject({
      state: 'overridden',
      values: [99],
    });
    expect(computed(bundle, f.catalogue.twoHopFieldId)).toMatchObject({ values: [21] });
    expect(bundle.fieldValues).toContainEqual(
      expect.objectContaining({ fieldId: f.catalogue.viaKitFieldId, source: 'override' })
    );
  });

  it('follows a rerouted reference: the old target stops re-sending, the new one starts', async () => {
    const f = await setup();
    const replacement = await createPart(f.target, f.catalogue, 9);

    await apply(
      f.target,
      edit(f, f.kitId, 1, [{ fieldId: f.catalogue.kitPartFieldId, values: [ref(replacement)] }])
    );
    expect(dependentsOf(f.target, f.partId)).toEqual([]);
    expect(dependentsOf(f.target, replacement)).toEqual([f.bundleId, f.kitId].toSorted());

    const beforeOld = await highWater(f.target);
    await apply(
      f.target,
      edit(f, f.partId, 1, [{ fieldId: f.catalogue.weightFieldId, values: [6] }])
    );
    expect((await changesSince(f.target, beforeOld)).items.map((item) => item.id)).toEqual([
      f.partId,
    ]);

    const beforeNew = await highWater(f.target);
    await apply(
      f.target,
      edit(f, replacement, 1, [{ fieldId: f.catalogue.weightFieldId, values: [4] }])
    );
    const feed = await changesSince(f.target, beforeNew);
    expect(computed(row(feed, f.bundleId), f.catalogue.twoHopFieldId)).toMatchObject({
      values: [12],
    });
  });

  it('replays a retried mutation without re-sending its dependents again', async () => {
    const f = await setup();
    const mutation = edit(f, f.partId, 1, [{ fieldId: f.catalogue.weightFieldId, values: [7] }]);
    await apply(f.target, mutation);
    const afterFirst = await highWater(f.target);
    const kitSeq = f.target.db.raw.prepare('SELECT seq FROM items WHERE id = ?').get(f.kitId);

    const retried = await send(f.target.api, [mutation]);

    expect(retried.status).toBe(200);
    expect(retried.body.outcomes[0]).toMatchObject({ status: 'applied', revision: 2 });
    expect(await highWater(f.target)).toBe(afterFirst);
    expect(f.target.db.raw.prepare('SELECT seq FROM items WHERE id = ?').get(f.kitId)).toEqual(
      kitSeq
    );
    expect((await changesSince(f.target, afterFirst)).items).toEqual([]);
  });

  it('re-sends at most the configured number of dependents, lowest ids first', async () => {
    const f = await setup();
    const kits = [f.kitId];
    for (let index = 0; index < 2; index += 1)
      kits.push(await createKit(f.target, f.catalogue, f.partId));
    const since = await highWater(f.target);

    const outcome = runMutation(
      f.target.db.db,
      edit(f, f.partId, 1, [{ fieldId: f.catalogue.weightFieldId, values: [7] }]),
      { kind: 'service', id: 'test' },
      { computedDependentLimit: 2 }
    );

    expect(outcome.status).toBe('applied');
    const resent = (await changesSince(f.target, since)).items
      .map((item) => item.id)
      .filter((id) => id !== f.partId)
      .toSorted();
    expect(resent).toEqual([...kits, f.bundleId].toSorted().slice(0, 2));
  });

  it('rolls the whole mutation back when re-sending its dependents fails', async () => {
    const f = await setup();
    f.target.db.raw.exec('DROP TABLE item_computed_dependencies');

    const response = await send(f.target.api, [
      edit(f, f.partId, 1, [{ fieldId: f.catalogue.weightFieldId, values: [7] }]),
    ]);

    expect(response.status).toBe(500);
    expect(
      f.target.db.raw.prepare('SELECT revision FROM items WHERE id = ?').get(f.partId)
    ).toEqual({ revision: 1 });
  });
});
