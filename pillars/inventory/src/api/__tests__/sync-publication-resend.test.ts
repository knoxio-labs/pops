/**
 * A catalogue publication that changes what computed values evaluate to
 * re-sends the affected items through the change feed (ADR-002 D5): every
 * item of a type whose computed definitions changed, and the index dependents
 * of every item such a type holds or a migration wrote.
 */
import { randomUUID } from 'node:crypto';

import { afterEach, describe, expect, it } from 'vitest';

import {
  publishReferenceComputedTypes,
  type ReferenceComputedCatalogue,
} from '../../catalogue/__tests__/computed-reference-fixture.js';
import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraftWith,
} from '../../catalogue/authoring.js';
import {
  apply,
  changesSince,
  computed,
  create,
  createKit,
  createPart,
  highWater,
  ref,
  row,
  type Feed,
} from './computed-feed-fixture.js';
import {
  openSyncHarness,
  PROTOCOL_2,
  send,
  wireMutation,
  type SyncHarness,
} from './sync-harness.js';
import { createTestTransport } from './test-http.js';

import type { CatalogueDescriptor, DraftOperation } from '../../catalogue/authoring-types.js';
import type { CataloguePublicationInput } from '../../catalogue/authoring.js';

const transport = createTestTransport();
const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
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

async function setup(): Promise<Fixture> {
  h = openSyncHarness(transport);
  const catalogue = publishReferenceComputedTypes(h.db.db);
  const partId = await createPart(h, catalogue, 5);
  const kitId = await createKit(h, catalogue, partId);
  const bundleId = randomUUID();
  await apply(
    h,
    create(catalogue, bundleId, {
      name: 'Bundle',
      typeId: catalogue.bundleTypeId,
      values: [{ fieldId: catalogue.bundleKitFieldId, values: [ref(kitId)] }],
    })
  );
  return { target: h, catalogue, partId, kitId, bundleId };
}

interface Publication {
  readonly operations: readonly DraftOperation[];
  readonly migration?: (draftRevision: number) => CataloguePublicationInput['migration'];
  readonly computedDependentLimit?: number;
}

function publish(f: Fixture, publication: Publication): CatalogueDescriptor {
  const db = f.target.db.db;
  const draft = createCatalogueDraft(db, f.catalogue.revision, AUTHOR);
  const revision = draft.revision.revision;
  const patched = patchCatalogueDraft(
    db,
    {
      revision,
      baseRevision: f.catalogue.revision,
      expectedDraftVersion: draft.revision.draftVersion,
    },
    publication.operations
  ).draft;
  const migration = publication.migration?.(revision);
  return publishCatalogueDraftWith(db, {
    revision,
    input: {
      baseRevision: f.catalogue.revision,
      expectedDraftVersion: patched.revision.draftVersion,
      note: null,
      ...(migration === undefined ? {} : { migration }),
    },
    author: AUTHOR,
    ...(publication.computedDependentLimit === undefined
      ? {}
      : { computedDependentLimit: publication.computedDependentLimit }),
  });
}

function kitWeightTimes(f: Fixture, factor: number): DraftOperation {
  return {
    kind: 'put_field',
    id: f.catalogue.kitWeightFieldId,
    typeId: f.catalogue.kitTypeId,
    expressionVersion: 1,
    expression: {
      op: 'multiply',
      left: { op: 'read', path: [f.catalogue.kitPartFieldId], fieldId: f.catalogue.weightFieldId },
      right: { op: 'literal', value: factor },
    },
  };
}

function doubleWeight(f: Fixture): DraftOperation {
  return {
    kind: 'put_field',
    typeId: f.catalogue.partTypeId,
    key: 'doubleWeight',
    label: 'Double weight',
    fieldKind: 'integer',
    cardinality: 'one',
    required: false,
    storage: 'computed',
    expressionVersion: 1,
    expression: {
      op: 'multiply',
      left: { op: 'read', path: [], fieldId: f.catalogue.weightFieldId },
      right: { op: 'literal', value: 2 },
    },
    allowOverride: false,
  };
}

function weightRequired(f: Fixture): Publication {
  return {
    operations: [
      {
        kind: 'put_field',
        id: f.catalogue.weightFieldId,
        typeId: f.catalogue.partTypeId,
        required: true,
      },
    ],
    migration: (toRevision) => ({
      name: 'default-part-weight',
      fromRevision: f.catalogue.revision,
      toRevision,
      affectedTypeIds: [f.catalogue.partTypeId],
      affectedFieldIds: [f.catalogue.weightFieldId],
      steps: [{ kind: 'set_default', fieldId: f.catalogue.weightFieldId, values: [8] }],
    }),
  };
}

function ids(feed: Feed): string[] {
  return feed.items.map((item) => item.id).toSorted();
}

function fieldText(f: Fixture, itemId: string): string {
  const found = f.target.db.raw
    .prepare('SELECT field_text AS text FROM items_fts WHERE id = ?')
    .get(itemId) as { text: string } | undefined;
  if (found === undefined) throw new Error(`no search entry for ${itemId}`);
  return found.text;
}

describe('re-sending items a catalogue publication recomputes', () => {
  it('re-sends every item of a type whose expression changed, and its dependents, with the new evaluation', async () => {
    const f = await setup();
    const since = await highWater(f.target);

    const published = publish(f, { operations: [kitWeightTimes(f, 5)] });

    const feed = await changesSince(f.target, since);
    expect(ids(feed)).toEqual([f.kitId, f.bundleId].toSorted());
    const kit = row(feed, f.kitId);
    const bundle = row(feed, f.bundleId);
    expect(kit.revision).toBe(1);
    expect(bundle.revision).toBe(1);
    expect(kit.seq).toBeGreaterThan(since);
    expect(bundle.seq).toBeGreaterThan(since);
    expect(computed(kit, f.catalogue.kitWeightFieldId)).toMatchObject({
      catalogueRevision: published.revision.revision,
      state: 'ok',
      values: [25],
    });
    expect(computed(bundle, f.catalogue.viaKitFieldId)).toMatchObject({
      catalogueRevision: published.revision.revision,
      state: 'ok',
      values: [26],
    });
    expect(feed.events.map((event) => event.entityId).toSorted()).toEqual(ids(feed));
    expect(feed.events.map((event) => [event.kind, event.undoable])).toEqual([
      ['recomputed', false],
      ['recomputed', false],
    ]);
    expect(fieldText(f, f.kitId)).toContain('25');
  });

  it('re-sends the live items of a type that gains a computed field, and their dependents', async () => {
    const f = await setup();
    const deleted = await createPart(f.target, f.catalogue, 2);
    await apply(f.target, wireMutation('item.delete', deleted, {}, { baseRevision: 1 }));
    const since = await highWater(f.target);

    publish(f, {
      operations: [doubleWeight(f)],
    });

    const feed = await changesSince(f.target, since);
    expect(ids(feed)).toEqual([f.partId, f.kitId, f.bundleId].toSorted());
    expect(row(feed, f.partId).computedValues).toContainEqual(
      expect.objectContaining({ state: 'ok', values: [10] })
    );
  });

  it('re-sends the items of a type that archives a computed field, and no one else', async () => {
    const f = await setup();
    const since = await highWater(f.target);

    publish(f, { operations: [{ kind: 'archive_field', id: f.catalogue.twoHopFieldId }] });

    expect(ids(await changesSince(f.target, since))).toEqual([f.bundleId]);
  });

  it('re-sends the items of a type whose override policy changed', async () => {
    const f = await setup();
    const since = await highWater(f.target);

    publish(f, {
      operations: [
        {
          kind: 'put_field',
          id: f.catalogue.kitWeightFieldId,
          typeId: f.catalogue.kitTypeId,
          allowOverride: true,
        },
      ],
    });

    expect(ids(await changesSince(f.target, since))).toEqual([f.kitId, f.bundleId].toSorted());
  });

  it('re-sends the dependents of an item a publication migration edits, and nothing else', async () => {
    const f = await setup();
    const unweighed = await createPart(f.target, f.catalogue, null);
    const readsUnweighed = await createKit(f.target, f.catalogue, unweighed);
    const since = await highWater(f.target);

    publish(f, weightRequired(f));

    const feed = await changesSince(f.target, since);
    expect(ids(feed)).toEqual([unweighed, readsUnweighed].toSorted());
    expect(feed.events.map((event) => [event.entityId, event.kind])).toEqual([
      [unweighed, 'migrated'],
      [readsUnweighed, 'recomputed'],
    ]);
    const kit = row(feed, readsUnweighed);
    expect(kit.revision).toBe(1);
    expect(computed(kit, f.catalogue.kitWeightFieldId)).toMatchObject({
      state: 'ok',
      values: [16],
    });
  });

  it('records no recomputed event for an item the same publication migrated', async () => {
    const f = await setup();
    const unweighed = await createPart(f.target, f.catalogue, null);
    const since = await highWater(f.target);
    const migration = weightRequired(f);

    publish(f, { ...migration, operations: [...migration.operations, doubleWeight(f)] });

    const feed = await changesSince(f.target, since);
    expect(feed.events.filter((event) => event.entityId === unweighed).map((e) => e.kind)).toEqual([
      'migrated',
    ]);
    expect(feed.events.filter((event) => event.entityId === f.partId).map((e) => e.kind)).toEqual([
      'recomputed',
    ]);
    expect(row(feed, unweighed).computedValues).toContainEqual(
      expect.objectContaining({ state: 'ok', values: [16] })
    );
  });

  it('re-sends nothing when a publication changes no computed definition', async () => {
    const f = await setup();
    const since = await highWater(f.target);

    publish(f, {
      operations: [{ kind: 'put_type', id: f.catalogue.kitTypeId, label: 'Kit of parts' }],
    });

    expect(await highWater(f.target)).toBe(since);
    expect((await changesSince(f.target, since)).items).toEqual([]);
  });

  it('re-sends at most the configured number of dependents, lowest ids first', async () => {
    const f = await setup();
    const unweighed = await createPart(f.target, f.catalogue, null);
    const kits: string[] = [];
    for (let index = 0; index < 3; index += 1)
      kits.push(await createKit(f.target, f.catalogue, unweighed));
    const since = await highWater(f.target);

    publish(f, { ...weightRequired(f), computedDependentLimit: 2 });

    const resent = ids(await changesSince(f.target, since)).filter((id) => id !== unweighed);
    expect(resent).toEqual(kits.toSorted().slice(0, 2));
  });

  it('refuses to revert a recomputed event', async () => {
    const f = await setup();
    const since = await highWater(f.target);
    publish(f, { operations: [kitWeightTimes(f, 5)] });
    const recomputed = (await changesSince(f.target, since)).events.find(
      (event) => event.entityId === f.kitId
    );
    if (recomputed === undefined) throw new Error('kit was not re-sent');

    const response = await send(
      f.target.api,
      [wireMutation('event.revert', f.kitId, { seq: recomputed.seq })],
      PROTOCOL_2
    );

    expect(response.status).toBe(200);
    expect(response.body.outcomes[0]).toMatchObject({
      status: 'rejected',
      reason: 'illegal_transition',
    });
  });
});
