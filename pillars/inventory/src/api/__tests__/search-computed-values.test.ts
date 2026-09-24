/**
 * Search indexes a computed field's effective value (Inventory ADR-002 D5):
 * the override when one exists, otherwise the evaluated value, and nothing
 * while it is unavailable. A dependency's write reindexes its re-sent
 * dependents in the same transaction.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  publishReferenceComputedTypes,
  type ReferenceComputedCatalogue,
} from '../../catalogue/__tests__/computed-reference-fixture.js';
import { createCatalogueDraft, publishCatalogueDraft } from '../../catalogue/authoring.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { runMutation } from '../../domain/commands/index.js';
import { createInventoryApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

import type { Mutation } from '../../domain/commands/index.js';

const ACTOR = { kind: 'service', id: 'search-test' } as const;
const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-search-computed-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
    })
  );
}

function mutation(
  catalogue: ReferenceComputedCatalogue,
  op: string,
  entityId: string,
  args: unknown,
  baseRevision: number | null
): Mutation {
  return {
    mutationId: randomUUID(),
    op,
    entityId,
    baseRevision,
    dependsOn: [],
    clientTime: '2026-09-24T00:00:00.000Z',
    catalogueRevision: catalogue.revision,
    args,
  };
}

function apply(entry: Mutation, computedDependentLimit?: number): void {
  const outcome = runMutation(
    inventoryDb.db,
    entry,
    ACTOR,
    computedDependentLimit === undefined ? {} : { computedDependentLimit }
  );
  expect(outcome).toMatchObject({ status: 'applied' });
}

function ref(targetId: string) {
  return { targetKind: 'item', targetId };
}

function create(
  catalogue: ReferenceComputedCatalogue,
  name: string,
  typeId: string,
  values: { fieldId: string; values: unknown[] }[]
): string {
  const id = randomUUID();
  apply(mutation(catalogue, 'item.create', id, { item: { name, typeId, values } }, null));
  return id;
}

interface Fixture {
  readonly catalogue: ReferenceComputedCatalogue;
  readonly partId: string;
  readonly kitId: string;
  readonly bundleId: string;
}

/** part.weight 111; kit.partWeight 222; bundle.twoHopWeight 333 and bundle.viaKit 223. */
function setup(): Fixture {
  const catalogue = publishReferenceComputedTypes(inventoryDb.db);
  const partId = create(catalogue, 'Part', catalogue.partTypeId, [
    { fieldId: catalogue.weightFieldId, values: [111] },
  ]);
  const kitId = create(catalogue, 'Kit', catalogue.kitTypeId, [
    { fieldId: catalogue.kitPartFieldId, values: [ref(partId)] },
  ]);
  const bundleId = create(catalogue, 'Bundle', catalogue.bundleTypeId, [
    { fieldId: catalogue.bundleKitFieldId, values: [ref(kitId)] },
  ]);
  return { catalogue, partId, kitId, bundleId };
}

function editWeight(f: Fixture, baseRevision: number, weight: number, limit?: number): void {
  apply(
    mutation(
      f.catalogue,
      'item.edit',
      f.partId,
      { values: [{ fieldId: f.catalogue.weightFieldId, values: [weight] }] },
      baseRevision
    ),
    limit
  );
}

async function found(text: string): Promise<string[]> {
  const { hits } = await client().search.run({ query: { text } });
  return hits.map((hit) => hit.uri.replace('/inventory/items/', '')).toSorted();
}

function fieldText(itemId: string): string {
  const row = inventoryDb.raw
    .prepare('SELECT field_text AS text FROM items_fts WHERE id = ?')
    .get(itemId) as { text: string } | undefined;
  if (row === undefined) throw new Error(`no search entry for ${itemId}`);
  return row.text;
}

function hasSearchEntry(itemId: string): boolean {
  return inventoryDb.raw.prepare('SELECT id FROM items_fts WHERE id = ?').get(itemId) !== undefined;
}

function dependencyRows(dependentItemId: string): { dependencyItemId: string }[] {
  return inventoryDb.raw
    .prepare(
      'SELECT dependency_item_id AS dependencyItemId FROM item_computed_dependencies WHERE dependent_item_id = ?'
    )
    .all(dependentItemId) as { dependencyItemId: string }[];
}

describe('search over computed field values', () => {
  it('finds an item by its evaluated computed value', async () => {
    const f = setup();

    expect(await found('222')).toEqual([f.kitId]);
    expect(await found('333')).toEqual([f.bundleId]);
    expect(await found('223')).toEqual([f.bundleId]);
  });

  it('indexes an override in place of the evaluation, and the evaluation again once cleared', async () => {
    const f = setup();

    apply(
      mutation(
        f.catalogue,
        'item.setOverride',
        f.bundleId,
        { fieldId: f.catalogue.viaKitFieldId, values: [987] },
        1
      )
    );
    expect(await found('987')).toEqual([f.bundleId]);
    expect(await found('223')).toEqual([]);

    apply(
      mutation(
        f.catalogue,
        'item.clearOverride',
        f.bundleId,
        { fieldId: f.catalogue.viaKitFieldId },
        2
      )
    );
    expect(await found('987')).toEqual([]);
    expect(await found('223')).toEqual([f.bundleId]);
  });

  it("reindexes direct and transitive dependents when a dependency's value changes", async () => {
    const f = setup();

    editWeight(f, 1, 444);

    expect(await found('222')).toEqual([]);
    expect(await found('888')).toEqual([f.kitId]);
    expect(await found('1332')).toEqual([f.bundleId]);
    expect(await found('889')).toEqual([f.bundleId]);
  });

  it('keeps an override indexed when its dependency changes', async () => {
    const f = setup();
    apply(
      mutation(
        f.catalogue,
        'item.setOverride',
        f.bundleId,
        { fieldId: f.catalogue.viaKitFieldId, values: [987] },
        1
      )
    );

    editWeight(f, 1, 444);

    expect(await found('987')).toEqual([f.bundleId]);
    expect(await found('889')).toEqual([]);
    expect(await found('1332')).toEqual([f.bundleId]);
  });

  it('drops a value that becomes unavailable, and restores it with its dependency', async () => {
    const f = setup();

    apply(mutation(f.catalogue, 'item.delete', f.partId, {}, 1));

    expect(await found('222')).toEqual([]);
    expect(await found('333')).toEqual([]);
    expect(fieldText(f.kitId)).toBe('');

    apply(mutation(f.catalogue, 'item.restoreDeleted', f.partId, {}, null));

    expect(await found('222')).toEqual([f.kitId]);
  });

  it('re-adds a deleted item to search on restore, by name and by its own computed value', async () => {
    const f = setup();

    apply(mutation(f.catalogue, 'item.delete', f.kitId, {}, 1));

    expect(hasSearchEntry(f.kitId)).toBe(false);
    expect(await found('Kit')).toEqual([]);
    expect(await found('222')).toEqual([]);

    apply(mutation(f.catalogue, 'item.restoreDeleted', f.kitId, {}, null));

    expect(hasSearchEntry(f.kitId)).toBe(true);
    expect(await found('Kit')).toEqual([f.kitId]);
    expect(await found('222')).toEqual([f.kitId]);
  });

  it("rebuilds a restored item's own dependency-index rows lost to a republish while it was deleted", () => {
    const f = setup();

    apply(mutation(f.catalogue, 'item.delete', f.kitId, {}, 1));

    const draft = createCatalogueDraft(inventoryDb.db, f.catalogue.revision, AUTHOR);
    publishCatalogueDraft(
      inventoryDb.db,
      draft.revision.revision,
      {
        baseRevision: f.catalogue.revision,
        expectedDraftVersion: draft.revision.draftVersion,
        note: null,
      },
      AUTHOR
    );
    expect(dependencyRows(f.kitId)).toEqual([]);

    apply(mutation(f.catalogue, 'item.restoreDeleted', f.kitId, {}, null));

    expect(dependencyRows(f.kitId)).toEqual([{ dependencyItemId: f.partId }]);
  });

  it('reindexes only the dependents the per-mutation limit re-sends, lowest ids first', () => {
    const f = setup();
    const extraKit = create(f.catalogue, 'Kit', f.catalogue.kitTypeId, [
      { fieldId: f.catalogue.kitPartFieldId, values: [ref(f.partId)] },
    ]);
    const dependents = [f.kitId, extraKit, f.bundleId].toSorted();
    const before = new Map(dependents.map((id) => [id, fieldText(id)]));

    editWeight(f, 1, 444, 1);

    const [first, ...rest] = dependents;
    if (first === undefined) throw new Error('no dependents');
    expect(fieldText(first)).not.toBe(before.get(first));
    for (const id of rest) expect(fieldText(id)).toBe(before.get(id));
  });

  it('indexes evaluations when the whole index is rebuilt at publication', async () => {
    const f = setup();
    inventoryDb.raw.exec('DELETE FROM items_fts');

    publishReferenceComputedTypesAgain(f);

    expect(await found('222')).toEqual([f.kitId]);
  });
});

function publishReferenceComputedTypesAgain(f: Fixture): void {
  const draft = createCatalogueDraft(inventoryDb.db, f.catalogue.revision, AUTHOR);
  publishCatalogueDraft(
    inventoryDb.db,
    draft.revision.revision,
    {
      baseRevision: f.catalogue.revision,
      expectedDraftVersion: draft.revision.draftVersion,
      note: null,
    },
    AUTHOR
  );
}
