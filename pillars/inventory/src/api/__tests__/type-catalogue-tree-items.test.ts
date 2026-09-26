import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SyncItemSchema } from '../../contract/rest-sync-schemas.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

const transport = createTestTransport();
const PROTOCOL_3 = { 'Pops-Inventory-Protocol': '3' };

interface RevisionBody {
  readonly revision: number;
  readonly draftVersion: number;
}

interface OptionBody {
  readonly id: string;
  readonly key: string;
  readonly label: string;
}

interface FieldBody {
  readonly id: string;
  readonly key: string;
  readonly enumOptions: OptionBody[];
}

interface TypeBody {
  readonly id: string;
  readonly key: string;
  readonly fields: FieldBody[];
}

interface DraftBody {
  readonly revision: RevisionBody;
  readonly types: TypeBody[];
}

interface DraftContext {
  readonly baseRevision: number;
  readonly revision: number;
  readonly draftVersion: number;
}

interface TreeCatalogue {
  readonly revision: number;
  readonly beddingTypeId: string;
  readonly linenTypeId: string;
  readonly sheetTypeId: string;
  readonly quiltCoverTypeId: string;
  readonly materialFieldId: string;
  readonly materialCottonOptionId: string;
  readonly brandFieldId: string;
  readonly labelFieldId: string;
  readonly partnerFieldId: string;
  readonly fittedFieldId: string;
}

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;
let api: BoundAgent;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-type-catalogue-tree-items-test-'));
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
): Promise<{ context: DraftContext; draft: DraftBody }> {
  const response = await api.patch(`/type-catalogue/drafts/${context.revision}`).send({
    baseRevision: context.baseRevision,
    expectedDraftVersion: context.draftVersion,
    operations,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const draft = response.body.draft as DraftBody;
  return {
    draft,
    context: {
      ...context,
      draftVersion: draft.revision.draftVersion,
    },
  };
}

async function createDraft(): Promise<{ context: DraftContext; draft: DraftBody }> {
  const current = await api.get('/type-catalogue');
  const baseRevision = current.body.revision.revision as number;
  const response = await api.post('/type-catalogue/drafts').send({ baseRevision });
  expect(response.status, JSON.stringify(response.body)).toBe(201);
  const draft = response.body as DraftBody;
  return {
    draft,
    context: {
      baseRevision,
      revision: draft.revision.revision,
      draftVersion: draft.revision.draftVersion,
    },
  };
}

function typeOf(types: readonly TypeBody[], key: string): TypeBody {
  const type = types.find((entry) => entry.key === key);
  if (type === undefined) throw new Error(`type ${key} was not created`);
  return type;
}

function fieldOf(type: TypeBody, key: string): FieldBody {
  const field = type.fields.find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`field ${key} was not created`);
  return field;
}

async function publishTree(): Promise<TreeCatalogue> {
  const rollout = await api.get('/type-catalogue/protocol-rollout');
  expect(rollout.status).toBe(200);
  const activation = await api.post('/type-catalogue/protocol-rollout').send({
    expectedMinimumProtocol: rollout.body.minimumProtocol,
    minimumProtocol: 3,
  });
  expect(activation.status, JSON.stringify(activation.body)).toBe(200);

  const created = await createDraft();
  const beddingPatch = await patchDraft(created.context, [
    { kind: 'put_type', key: 'bedding', label: 'Bedding', capabilities: ['containment'] },
  ]);
  const beddingTypeId = typeOf(beddingPatch.draft.types, 'bedding').id;
  const linenPatch = await patchDraft(beddingPatch.context, [
    { kind: 'put_type', key: 'linen', label: 'Linen', parentTypeId: beddingTypeId },
  ]);
  const linenTypeId = typeOf(linenPatch.draft.types, 'linen').id;
  const sheetPatch = await patchDraft(linenPatch.context, [
    { kind: 'put_type', key: 'sheet', label: 'Sheet', parentTypeId: linenTypeId },
  ]);
  const sheetTypeId = typeOf(sheetPatch.draft.types, 'sheet').id;
  const quiltPatch = await patchDraft(sheetPatch.context, [
    { kind: 'put_type', key: 'quilt_cover', label: 'Quilt cover', parentTypeId: linenTypeId },
  ]);
  const quiltCoverTypeId = typeOf(quiltPatch.draft.types, 'quilt_cover').id;

  const materialPatch = await patchDraft(quiltPatch.context, [
    {
      kind: 'put_field',
      typeId: beddingTypeId,
      key: 'material',
      label: 'Material',
      fieldKind: 'enum',
      cardinality: 'one',
      required: true,
      storage: 'stored',
    },
  ]);
  const materialFieldId = fieldOf(typeOf(materialPatch.draft.types, 'bedding'), 'material').id;
  const optionPatch = await patchDraft(materialPatch.context, [
    { kind: 'put_enum_option', fieldId: materialFieldId, key: 'cotton', label: 'Cotton' },
  ]);
  const materialCottonOptionId = fieldOf(
    typeOf(optionPatch.draft.types, 'bedding'),
    'material'
  ).enumOptions.find((entry) => entry.key === 'cotton')?.id;
  if (materialCottonOptionId === undefined) throw new Error('cotton option was not created');

  const brandPatch = await patchDraft(optionPatch.context, [
    {
      kind: 'put_field',
      typeId: beddingTypeId,
      key: 'brand',
      label: 'Brand',
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]);
  const brandFieldId = fieldOf(typeOf(brandPatch.draft.types, 'bedding'), 'brand').id;
  const labelPatch = await patchDraft(brandPatch.context, [
    {
      kind: 'put_field',
      typeId: beddingTypeId,
      key: 'label',
      label: 'Label',
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      expressionVersion: 1,
      expression: {
        op: 'concat',
        left: { op: 'read', path: [], fieldId: brandFieldId },
        right: { op: 'literal', value: ' bedding' },
      },
      allowOverride: false,
    },
  ]);
  const labelFieldId = fieldOf(typeOf(labelPatch.draft.types, 'bedding'), 'label').id;
  const partnerPatch = await patchDraft(labelPatch.context, [
    {
      kind: 'put_field',
      typeId: beddingTypeId,
      key: 'partner',
      label: 'Partner',
      fieldKind: 'reference',
      cardinality: 'one',
      required: false,
      storage: 'stored',
      referenceKinds: ['item'],
      referenceTypeIds: [beddingTypeId],
    },
  ]);
  const partnerFieldId = fieldOf(typeOf(partnerPatch.draft.types, 'bedding'), 'partner').id;
  const partnerBrandPatch = await patchDraft(partnerPatch.context, [
    {
      kind: 'put_field',
      typeId: beddingTypeId,
      key: 'partner_brand',
      label: 'Partner brand',
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      expressionVersion: 1,
      expression: { op: 'read', path: [partnerFieldId], fieldId: brandFieldId },
      allowOverride: false,
    },
  ]);
  const fittedPatch = await patchDraft(partnerBrandPatch.context, [
    {
      kind: 'put_field',
      typeId: sheetTypeId,
      key: 'fitted',
      label: 'Fitted',
      fieldKind: 'boolean',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]);
  const fittedFieldId = fieldOf(typeOf(fittedPatch.draft.types, 'sheet'), 'fitted').id;
  const closurePatch = await patchDraft(fittedPatch.context, [
    {
      kind: 'put_field',
      typeId: quiltCoverTypeId,
      key: 'closure',
      label: 'Closure',
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]);
  const published = await api
    .post(`/type-catalogue/drafts/${closurePatch.context.revision}/publish`)
    .send({
      baseRevision: closurePatch.context.baseRevision,
      expectedDraftVersion: closurePatch.context.draftVersion,
    });
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return {
    revision: closurePatch.context.revision,
    beddingTypeId,
    linenTypeId,
    sheetTypeId,
    quiltCoverTypeId,
    materialFieldId,
    materialCottonOptionId,
    brandFieldId,
    labelFieldId,
    partnerFieldId,
    fittedFieldId,
  };
}

async function syncMutation(
  op: string,
  entityId: string,
  args: unknown,
  extra: { baseRevision: number | null; catalogueRevision?: number }
) {
  const response = await api
    .post('/sync/mutations')
    .set(PROTOCOL_3)
    .send({
      mutations: [
        {
          mutationId: randomUUID(),
          op,
          entityId,
          baseRevision: extra.baseRevision,
          catalogueRevision: extra.catalogueRevision,
          dependsOn: [],
          clientTime: '2026-09-27T00:00:00.000Z',
          args,
        },
      ],
    });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.outcomes[0] as {
    readonly status: string;
    readonly message?: string;
    readonly reason?: string;
  };
}

async function createSheet(
  catalogue: TreeCatalogue,
  values: readonly { fieldId: string; values: readonly unknown[] }[]
): Promise<{
  id: string;
  outcome: { readonly status: string; readonly message?: string; readonly reason?: string };
}> {
  const id = randomUUID();
  const outcome = await syncMutation(
    'item.create',
    id,
    {
      item: {
        name: 'Sheet',
        typeId: catalogue.sheetTypeId,
        values,
        placement: { kind: 'hand' },
      },
    },
    { baseRevision: null, catalogueRevision: catalogue.revision }
  );
  return { id, outcome };
}

async function snapshotItem(id: string) {
  const response = await api.get('/sync/snapshot').set(PROTOCOL_3);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  const item = SyncItemSchema.array()
    .parse(response.body.items)
    .find((entry) => entry.id === id);
  if (item === undefined) throw new Error(`snapshot lacks ${id}`);
  return item;
}

describe('items against effective type-tree definitions', () => {
  it('requires inherited Material and accepts a sheet item when it is supplied', async () => {
    const catalogue = await publishTree();
    const missing = await createSheet(catalogue, []);

    expect(missing.outcome).toMatchObject({ status: 'rejected', reason: 'invalid' });
    expect(missing.outcome.message).toContain(
      `field ${catalogue.materialFieldId}: requires a value`
    );

    const validation = await api.post('/type-catalogue/items/validate').send({
      catalogueRevision: catalogue.revision,
      typeId: catalogue.sheetTypeId,
      fieldValues: [],
    });
    expect(validation.status).toBe(400);
    expect(validation.body.issues).toContainEqual(
      expect.objectContaining({ code: 'required_missing', definitionId: catalogue.materialFieldId })
    );

    const accepted = await createSheet(catalogue, [
      {
        fieldId: catalogue.materialFieldId,
        values: [{ optionId: catalogue.materialCottonOptionId }],
      },
    ]);
    expect(accepted.outcome).toMatchObject({ status: 'applied' });
  });

  it('makes a sheet item a container through inherited containment', async () => {
    const catalogue = await publishTree();
    const created = await createSheet(catalogue, [
      {
        fieldId: catalogue.materialFieldId,
        values: [{ optionId: catalogue.materialCottonOptionId }],
      },
    ]);

    expect(created.outcome).toMatchObject({ status: 'applied' });
    expect((await snapshotItem(created.id)).isContainer).toBe(true);
  });

  it('evaluates an inherited computed Label on a sheet item', async () => {
    const catalogue = await publishTree();
    const created = await createSheet(catalogue, [
      {
        fieldId: catalogue.materialFieldId,
        values: [{ optionId: catalogue.materialCottonOptionId }],
      },
      { fieldId: catalogue.brandFieldId, values: ['Acme'] },
    ]);

    expect(created.outcome).toMatchObject({ status: 'applied' });
    expect((await snapshotItem(created.id)).computedValues).toContainEqual({
      fieldId: catalogue.labelFieldId,
      source: 'computed',
      catalogueRevision: catalogue.revision,
      state: 'ok',
      values: ['Acme bedding'],
      dependencies: [{ itemId: created.id, fieldId: catalogue.brandFieldId, revision: 1 }],
      traversedItemIds: [created.id],
    });
  });

  it('makes a newly published optional parent field writable on an existing sheet item', async () => {
    const catalogue = await publishTree();
    const created = await createSheet(catalogue, [
      {
        fieldId: catalogue.materialFieldId,
        values: [{ optionId: catalogue.materialCottonOptionId }],
      },
    ]);
    expect(created.outcome).toMatchObject({ status: 'applied' });

    const current = await api.get('/type-catalogue');
    const draftResponse = await api
      .post('/type-catalogue/drafts')
      .send({ baseRevision: current.body.revision.revision });
    expect(draftResponse.status).toBe(201);
    const context: DraftContext = {
      baseRevision: current.body.revision.revision,
      revision: draftResponse.body.revision.revision,
      draftVersion: draftResponse.body.revision.draftVersion,
    };
    const patched = await patchDraft(context, [
      {
        kind: 'put_field',
        typeId: catalogue.beddingTypeId,
        key: 'colour',
        label: 'Colour',
        fieldKind: 'short_text',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
    ]);
    const colourFieldId = fieldOf(typeOf(patched.draft.types, 'bedding'), 'colour').id;
    const published = await api
      .post(`/type-catalogue/drafts/${patched.context.revision}/publish`)
      .send({
        baseRevision: patched.context.baseRevision,
        expectedDraftVersion: patched.context.draftVersion,
      });
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const nextRevision = published.body.revision.revision as number;

    const edited = await syncMutation(
      'item.edit',
      created.id,
      { values: [{ fieldId: colourFieldId, values: ['Blue'] }] },
      { baseRevision: 1, catalogueRevision: nextRevision }
    );
    expect(edited).toMatchObject({ status: 'applied' });
  });
});
