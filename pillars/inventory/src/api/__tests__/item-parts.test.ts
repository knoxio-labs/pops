import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

const transport = createTestTransport();
const PROTOCOL_3 = { 'Pops-Inventory-Protocol': '3' };

interface DraftContext {
  readonly baseRevision: number;
  readonly revision: number;
  readonly draftVersion: number;
}

interface TypeBody {
  readonly id: string;
  readonly key: string;
}

interface Catalogue {
  readonly revision: number;
  readonly kitTypeId: string;
  readonly blenderKitTypeId: string;
  readonly plainTypeId: string;
}

interface PartsBody {
  readonly canHaveParts: boolean;
  readonly assembly: { itemId: string; name: string } | null;
  readonly parts: {
    itemId: string;
    name: string;
    placement: { kind: string; locationName: string | null; containingItemName: string | null };
  }[];
}

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;
let api: BoundAgent;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-item-parts-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  api = transport.requestOn(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
      identityResolver: () =>
        Promise.resolve({ user: { email: 'owner@example.com' }, serviceAccount: null }),
    })
  );
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

async function patchDraft(
  context: DraftContext,
  operations: readonly Record<string, unknown>[]
): Promise<{ context: DraftContext; types: TypeBody[] }> {
  const response = await api.patch(`/type-catalogue/drafts/${context.revision}`).send({
    baseRevision: context.baseRevision,
    expectedDraftVersion: context.draftVersion,
    operations,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return {
    types: response.body.draft.types as TypeBody[],
    context: { ...context, draftVersion: response.body.draft.revision.draftVersion as number },
  };
}

function plainId(types: readonly TypeBody[]): string {
  return typeId(types, 'plain');
}

function typeId(types: readonly TypeBody[], key: string): string {
  const type = types.find((entry) => entry.key === key);
  if (type === undefined) throw new Error(`type ${key} was not created`);
  return type.id;
}

async function publishCatalogue(): Promise<Catalogue> {
  const rollout = await api.get('/type-catalogue/protocol-rollout');
  const activation = await api.post('/type-catalogue/protocol-rollout').send({
    expectedMinimumProtocol: rollout.body.minimumProtocol,
    minimumProtocol: 3,
  });
  expect(activation.status, JSON.stringify(activation.body)).toBe(200);

  const current = await api.get('/type-catalogue');
  const baseRevision = current.body.revision.revision as number;
  const draft = await api.post('/type-catalogue/drafts').send({ baseRevision });
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const start: DraftContext = {
    baseRevision,
    revision: draft.body.revision.revision as number,
    draftVersion: draft.body.revision.draftVersion as number,
  };
  const first = await patchDraft(start, [
    { kind: 'put_type', key: 'kit', label: 'Kit', capabilities: ['parts'] },
    { kind: 'put_type', key: 'plain', label: 'Plain' },
  ]);
  const kitTypeId = typeId(first.types, 'kit');
  const second = await patchDraft(first.context, [
    { kind: 'put_type', key: 'blender_kit', label: 'Blender kit', parentTypeId: kitTypeId },
    {
      kind: 'put_type',
      key: 'plain_child',
      label: 'Plain child',
      parentTypeId: plainId(first.types),
    },
  ]);
  const published = await api.post(`/type-catalogue/drafts/${start.revision}/publish`).send({
    baseRevision,
    expectedDraftVersion: second.context.draftVersion,
  });
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return {
    revision: start.revision,
    kitTypeId,
    blenderKitTypeId: typeId(second.types, 'blender_kit'),
    plainTypeId: typeId(first.types, 'plain'),
  };
}

async function createItem(
  catalogue: Catalogue,
  name: string,
  typeIdValue: string,
  placement: Record<string, unknown> = { kind: 'hand' }
): Promise<string> {
  const id = randomUUID();
  const response = await api
    .post('/sync/mutations')
    .set(PROTOCOL_3)
    .send({
      mutations: [
        {
          mutationId: randomUUID(),
          op: 'item.create',
          entityId: id,
          baseRevision: null,
          catalogueRevision: catalogue.revision,
          dependsOn: [],
          clientTime: '2026-10-22T00:00:00.000Z',
          args: { item: { name, typeId: typeIdValue, values: [], placement } },
        },
      ],
    });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  expect(response.body.outcomes[0].status, JSON.stringify(response.body)).toBe('applied');
  return id;
}

async function parts(itemId: string): Promise<PartsBody> {
  const response = await api.get(`/items/${itemId}/parts`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.data as PartsBody;
}

function addPart(assemblyId: string, partItemId: string) {
  return api.post(`/items/${assemblyId}/parts`).send({ partItemId });
}

async function grantPartsToPlain(catalogue: Catalogue): Promise<number> {
  const draft = await api.post('/type-catalogue/drafts').send({ baseRevision: catalogue.revision });
  expect(draft.status, JSON.stringify(draft.body)).toBe(201);
  const start: DraftContext = {
    baseRevision: catalogue.revision,
    revision: draft.body.revision.revision as number,
    draftVersion: draft.body.revision.draftVersion as number,
  };
  const patched = await patchDraft(start, [
    {
      kind: 'put_type',
      id: catalogue.plainTypeId,
      key: 'plain',
      label: 'Plain',
      capabilities: ['parts'],
    },
  ]);
  const published = await api.post(`/type-catalogue/drafts/${start.revision}/publish`).send({
    baseRevision: catalogue.revision,
    expectedDraftVersion: patched.context.draftVersion,
  });
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return start.revision;
}

describe('item parts', () => {
  it('lists parts with where each one is, and names the assembly from the part', async () => {
    const catalogue = await publishCatalogue();
    const kitchen = await api.post('/locations').send({ name: 'Kitchen' });
    expect(kitchen.status, JSON.stringify(kitchen.body)).toBe(201);
    const kitchenId = kitchen.body.data.id as string;
    const kit = await createItem(catalogue, 'Ninja kit', catalogue.kitTypeId);
    const box = await createItem(catalogue, 'Box 3', catalogue.plainTypeId);
    const base = await createItem(catalogue, 'Motor base', catalogue.plainTypeId, {
      kind: 'location',
      locationId: kitchenId,
    });
    const cup = await createItem(catalogue, 'Cup', catalogue.plainTypeId);

    expect((await addPart(kit, base)).status).toBe(200);
    const added = await addPart(kit, cup);
    expect(added.status).toBe(200);

    const view = added.body.data as PartsBody;
    expect(view.canHaveParts).toBe(true);
    expect(view.assembly).toBeNull();
    expect(view.parts.map((part) => part.name)).toEqual(['Cup', 'Motor base']);
    expect(view.parts[1]?.placement).toMatchObject({ kind: 'location', locationName: 'Kitchen' });
    expect(view.parts[0]?.placement).toMatchObject({ kind: 'hand', locationName: null });

    const fromPart = await parts(base);
    expect(fromPart.canHaveParts).toBe(false);
    expect(fromPart.assembly).toMatchObject({ itemId: kit, name: 'Ninja kit' });
    expect(fromPart.parts).toEqual([]);
    expect((await parts(box)).assembly).toBeNull();
  });

  it('refuses parts on an item whose type does not grant the capability', async () => {
    const catalogue = await publishCatalogue();
    const plain = await createItem(catalogue, 'Toaster', catalogue.plainTypeId);
    const other = await createItem(catalogue, 'Crumb tray', catalogue.plainTypeId);

    const response = await addPart(plain, other);
    expect(response.status).toBe(409);
    expect(JSON.stringify(response.body)).toContain('parts capability');
    expect((await parts(plain)).canHaveParts).toBe(false);
  });

  it('grants parts to a subtype through its parent type', async () => {
    const catalogue = await publishCatalogue();
    const kit = await createItem(catalogue, 'Blender kit', catalogue.blenderKitTypeId);
    const blade = await createItem(catalogue, 'Blade', catalogue.plainTypeId);

    expect((await addPart(kit, blade)).status).toBe(200);
    expect((await parts(kit)).canHaveParts).toBe(true);
  });

  it('keeps a part in one assembly and treats re-adding it as a no-op', async () => {
    const catalogue = await publishCatalogue();
    const first = await createItem(catalogue, 'Kit A', catalogue.kitTypeId);
    const second = await createItem(catalogue, 'Kit B', catalogue.kitTypeId);
    const lid = await createItem(catalogue, 'Lid', catalogue.plainTypeId);

    expect((await addPart(first, lid)).status).toBe(200);
    const again = await addPart(first, lid);
    expect(again.status).toBe(200);
    expect((again.body.data as PartsBody).parts).toHaveLength(1);

    const elsewhere = await addPart(second, lid);
    expect(elsewhere.status).toBe(409);
    expect(JSON.stringify(elsewhere.body)).toContain('already a part of');
    expect((await parts(second)).parts).toEqual([]);
  });

  it('refuses an item as its own part, directly or through a nested assembly', async () => {
    const catalogue = await publishCatalogue();
    const outer = await createItem(catalogue, 'Outer', catalogue.kitTypeId);
    const middle = await createItem(catalogue, 'Middle', catalogue.kitTypeId);
    const inner = await createItem(catalogue, 'Inner', catalogue.kitTypeId);

    expect((await addPart(outer, outer)).status).toBe(409);
    expect((await addPart(outer, middle)).status).toBe(200);
    expect((await addPart(middle, inner)).status).toBe(200);

    const cycle = await addPart(inner, outer);
    expect(cycle.status).toBe(409);
    expect((await parts(outer)).assembly).toBeNull();
  });

  it('removes a part without touching the item, and 404s a part that is not one', async () => {
    const catalogue = await publishCatalogue();
    const kit = await createItem(catalogue, 'Kit', catalogue.kitTypeId);
    const cup = await createItem(catalogue, 'Cup', catalogue.plainTypeId);
    expect((await addPart(kit, cup)).status).toBe(200);

    const removed = await api.delete(`/items/${kit}/parts/${cup}`);
    expect(removed.status).toBe(200);
    expect((removed.body.data as PartsBody).parts).toEqual([]);
    expect((await api.get(`/items/${cup}`)).status).toBe(200);
    expect((await parts(cup)).assembly).toBeNull();

    expect((await api.delete(`/items/${kit}/parts/${cup}`)).status).toBe(404);
  });

  it('publishes parts onto an existing type with a subtype without a migration', async () => {
    const catalogue = await publishCatalogue();
    const child = (await api.get('/type-catalogue')).body.types.find(
      (entry: TypeBody) => entry.key === 'plain_child'
    ) as TypeBody;
    const couch = await createItem(catalogue, 'Couch', child.id);
    const module = await createItem(catalogue, 'Corner module', catalogue.plainTypeId);
    expect((await addPart(couch, module)).status).toBe(409);

    await grantPartsToPlain(catalogue);

    expect((await parts(couch)).canHaveParts).toBe(true);
    expect((await addPart(couch, module)).status).toBe(200);
  });

  it('404s an unknown assembly or part', async () => {
    const catalogue = await publishCatalogue();
    const kit = await createItem(catalogue, 'Kit', catalogue.kitTypeId);

    expect((await api.get('/items/missing/parts')).status).toBe(404);
    expect((await addPart('missing', kit)).status).toBe(404);
    expect((await addPart(kit, 'missing')).status).toBe(404);
  });

  it('frees the parts of a deleted assembly so another can take them', async () => {
    const catalogue = await publishCatalogue();
    const oldKit = await createItem(catalogue, 'Old kit', catalogue.kitTypeId);
    const newKit = await createItem(catalogue, 'New kit', catalogue.kitTypeId);
    const cup = await createItem(catalogue, 'Cup', catalogue.plainTypeId);
    expect((await addPart(oldKit, cup)).status).toBe(200);

    expect((await api.delete(`/items/${oldKit}`)).status).toBe(200);
    expect((await parts(cup)).assembly).toBeNull();

    expect((await addPart(newKit, cup)).status).toBe(200);
    expect((await parts(cup)).assembly).toMatchObject({ itemId: newKit });
  });

  it('hides a deleted part from its assembly', async () => {
    const catalogue = await publishCatalogue();
    const kit = await createItem(catalogue, 'Kit', catalogue.kitTypeId);
    const cup = await createItem(catalogue, 'Cup', catalogue.plainTypeId);
    expect((await addPart(kit, cup)).status).toBe(200);

    expect((await api.delete(`/items/${cup}`)).status).toBe(200);
    expect((await parts(kit)).parts).toEqual([]);
  });
});
