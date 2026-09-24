/**
 * POPS-4361: search and containment continue to work after a runtime
 * catalogue update — a published draft applied without restarting the
 * process. Exercises the full REST surface: catalogue drafts and publish,
 * item creation and moves over `/sync/mutations`, and `/search`.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { PROTOCOL_2, send, wireMutation, type WireMutation } from './sync-harness.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const transport = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;
let api: BoundAgent;

interface Draft {
  readonly revision: number;
  readonly baseRevision: number;
  readonly draftVersion: number;
}

interface DraftField {
  readonly id: string;
  readonly key: string;
}

interface DraftTypeBody {
  readonly types: { id: string; key: string; fields: DraftField[] }[];
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-runtime-search-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  const rejectServiceAccount: ServiceAccountVerifier = () =>
    Promise.resolve({ outcome: 'rejected' });
  api = transport.requestOn(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3006',
      serviceAccountVerifier: rejectServiceAccount,
      identityResolver: () =>
        Promise.resolve({ user: { email: 'owner@example.com' }, serviceAccount: null }),
    })
  );
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

async function activateProtocol2(): Promise<void> {
  const response = await api
    .post('/type-catalogue/protocol-rollout')
    .send({ expectedMinimumProtocol: 1, minimumProtocol: 2 });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
}

async function createDraft(baseRevision: number): Promise<Draft> {
  const created = await api.post('/type-catalogue/drafts').send({ baseRevision });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return {
    revision: created.body.revision.revision,
    baseRevision,
    draftVersion: created.body.revision.draftVersion,
  };
}

async function patch(draft: Draft, operations: readonly unknown[]) {
  const response = await api.patch(`/type-catalogue/drafts/${draft.revision}`).send({
    baseRevision: draft.baseRevision,
    expectedDraftVersion: draft.draftVersion,
    operations,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return {
    draft: { ...draft, draftVersion: response.body.draft.revision.draftVersion as number },
    body: response.body.draft as DraftTypeBody,
  };
}

function publish(draft: Draft, extra: Record<string, unknown> = {}) {
  return api.post(`/type-catalogue/drafts/${draft.revision}/publish`).send({
    baseRevision: draft.baseRevision,
    expectedDraftVersion: draft.draftVersion,
    ...extra,
  });
}

function typeIdOf(body: DraftTypeBody, key: string): string {
  const type = body.types.find((entry) => entry.key === key);
  if (type === undefined) throw new Error(`type ${key} is missing`);
  return type.id;
}

function fieldIdOf(body: DraftTypeBody, typeId: string, key: string): string {
  const type = body.types.find((entry) => entry.id === typeId);
  if (type === undefined) throw new Error(`type ${typeId} is missing`);
  const field = type.fields.find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`field ${key} is missing`);
  return field.id;
}

async function sendMutations(mutations: readonly WireMutation[]) {
  const response = await send(api, mutations, PROTOCOL_2);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.outcomes as { status: string; reason?: string; mutationId: string }[];
}

async function applyAll(mutations: readonly WireMutation[]): Promise<void> {
  for (const outcome of await sendMutations(mutations)) {
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'applied' });
  }
}

interface Catalogue {
  readonly revision: number;
  readonly widgetTypeId: string;
  readonly materialFieldId: string;
  readonly colorFieldId: string;
  readonly priceFieldId: string;
  readonly valueScoreFieldId: string;
  readonly boxTypeId: string;
  readonly crateTypeId: string;
  readonly binTypeId: string;
}

function valueScoreExpression(priceFieldId: string, multiplier: number) {
  return {
    op: 'multiply',
    left: { op: 'read', path: [], fieldId: priceFieldId },
    right: { op: 'literal', value: multiplier },
  };
}

/** Publishes the base catalogue: a `widget` value type and three container-capable types. */
async function publishBaseCatalogue(): Promise<Catalogue> {
  await activateProtocol2();
  const draft0 = await createDraft(1);
  const withTypes = await patch(draft0, [
    { kind: 'put_type', key: 'widget', label: 'Widget' },
    { kind: 'put_type', key: 'box', label: 'Box', capabilities: ['containment'] },
    { kind: 'put_type', key: 'crate', label: 'Crate', capabilities: ['containment'] },
    { kind: 'put_type', key: 'bin', label: 'Bin', capabilities: ['containment'] },
  ]);
  const widgetTypeId = typeIdOf(withTypes.body, 'widget');
  const boxTypeId = typeIdOf(withTypes.body, 'box');
  const crateTypeId = typeIdOf(withTypes.body, 'crate');
  const binTypeId = typeIdOf(withTypes.body, 'bin');

  const withFields = await patch(withTypes.draft, [
    {
      kind: 'put_field',
      typeId: widgetTypeId,
      key: 'material',
      label: 'Material',
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
    {
      kind: 'put_field',
      typeId: widgetTypeId,
      key: 'color',
      label: 'Color',
      fieldKind: 'short_text',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
    {
      kind: 'put_field',
      typeId: widgetTypeId,
      key: 'price_cents',
      label: 'Price cents',
      fieldKind: 'integer',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]);
  const materialFieldId = fieldIdOf(withFields.body, widgetTypeId, 'material');
  const colorFieldId = fieldIdOf(withFields.body, widgetTypeId, 'color');
  const priceFieldId = fieldIdOf(withFields.body, widgetTypeId, 'price_cents');

  const withComputed = await patch(withFields.draft, [
    {
      kind: 'put_field',
      typeId: widgetTypeId,
      key: 'value_score',
      label: 'Value score',
      fieldKind: 'integer',
      cardinality: 'one',
      required: false,
      storage: 'computed',
      expressionVersion: 1,
      expression: valueScoreExpression(priceFieldId, 2),
      allowOverride: false,
    },
  ]);
  const valueScoreFieldId = fieldIdOf(withComputed.body, widgetTypeId, 'value_score');

  const published = await publish(withComputed.draft);
  expect(published.status, JSON.stringify(published.body)).toBe(200);

  return {
    revision: draft0.revision,
    widgetTypeId,
    materialFieldId,
    colorFieldId,
    priceFieldId,
    valueScoreFieldId,
    boxTypeId,
    crateTypeId,
    binTypeId,
  };
}

function createWidget(
  catalogue: Catalogue,
  name: string,
  values: { fieldId: string; values: unknown[] },
  placement: unknown = { kind: 'hand' }
): { id: string; mutation: WireMutation } {
  const id = randomUUID();
  return {
    id,
    mutation: wireMutation(
      'item.create',
      id,
      { item: { name, typeId: catalogue.widgetTypeId, values: [values], placement } },
      { catalogueRevision: catalogue.revision }
    ),
  };
}

function createContainer(
  catalogue: Catalogue,
  typeId: string,
  name: string
): { id: string; mutation: WireMutation } {
  const id = randomUUID();
  return {
    id,
    mutation: wireMutation(
      'item.create',
      id,
      { item: { name, typeId, values: [] } },
      { catalogueRevision: catalogue.revision }
    ),
  };
}

async function found(text: string): Promise<string[]> {
  const response = await api.post('/search').send({ query: { text } });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return (response.body.hits as { uri: string }[])
    .map((hit) => hit.uri.replace('/inventory/items/', ''))
    .toSorted();
}

async function containerIdOf(itemId: string): Promise<string | null> {
  const response = await api.get(`/items/${itemId}`);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.data.containerId as string | null;
}

async function childrenOf(containerId: string): Promise<string[]> {
  const response = await api.get('/items').query({ containerId });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return (response.body.data as { id: string }[]).map((item) => item.id).toSorted();
}

describe('runtime catalogue update — search and containment', () => {
  it('keeps search and containment correct across a rename, an archive, a new field, a re-expressed computed field and a capability change', async () => {
    const catalogue = await publishBaseCatalogue();

    const box = createContainer(catalogue, catalogue.boxTypeId, 'Toolbox');
    const crate = createContainer(catalogue, catalogue.crateTypeId, 'Crate one');
    const bin = createContainer(catalogue, catalogue.binTypeId, 'Bin one');
    const widget = createWidget(
      catalogue,
      'Gadget widget',
      { fieldId: catalogue.materialFieldId, values: ['Oak'] },
      { kind: 'container', itemId: box.id }
    );
    const crateWidget = createWidget(
      catalogue,
      'Crated widget',
      { fieldId: catalogue.materialFieldId, values: ['Pine'] },
      { kind: 'container', itemId: crate.id }
    );
    await applyAll([
      box.mutation,
      crate.mutation,
      bin.mutation,
      widget.mutation,
      crateWidget.mutation,
    ]);

    await applyAll([
      wireMutation(
        'item.edit',
        widget.id,
        { values: [{ fieldId: catalogue.colorFieldId, values: ['Red'] }] },
        { baseRevision: 1, catalogueRevision: catalogue.revision }
      ),
      wireMutation(
        'item.edit',
        widget.id,
        { values: [{ fieldId: catalogue.priceFieldId, values: [500] }] },
        { baseRevision: 2, catalogueRevision: catalogue.revision }
      ),
    ]);

    expect(await found('Gadget')).toEqual([widget.id]);
    expect(await found('Oak')).toEqual([widget.id]);
    expect(await found('Red')).toEqual([widget.id]);
    expect(await found('1000')).toEqual([widget.id]); // value_score = 500 * 2
    expect(await containerIdOf(widget.id)).toBe(box.id);
    expect(await childrenOf(box.id)).toEqual([widget.id]);

    // Revision 2: a compatible rename of the type and a field, an archived
    // field, a new field and a re-expressed computed field, all in one draft.
    const draft2 = await createDraft(catalogue.revision);
    const patched2 = await patch(draft2, [
      { kind: 'put_type', id: catalogue.widgetTypeId, label: 'Widget Mk2' },
      {
        kind: 'put_field',
        id: catalogue.colorFieldId,
        typeId: catalogue.widgetTypeId,
        label: 'Colour',
      },
      {
        kind: 'put_field',
        id: catalogue.materialFieldId,
        typeId: catalogue.widgetTypeId,
        archivedAt: '2026-09-24T00:00:00.000Z',
      },
      {
        kind: 'put_field',
        typeId: catalogue.widgetTypeId,
        key: 'weight_grams',
        label: 'Weight (g)',
        fieldKind: 'integer',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
      {
        kind: 'put_field',
        id: catalogue.valueScoreFieldId,
        typeId: catalogue.widgetTypeId,
        expression: valueScoreExpression(catalogue.priceFieldId, 3),
      },
    ]);
    expect(patched2.body.types.find((t) => t.id === catalogue.widgetTypeId)).toBeDefined();
    const revision2 = draft2.revision;
    const weightFieldId = fieldIdOf(patched2.body, catalogue.widgetTypeId, 'weight_grams');
    const published2 = await publish(patched2.draft);
    expect(published2.status, JSON.stringify(published2.body)).toBe(200);

    // Name and pre-existing values remain searchable, unaffected by the rename.
    expect(await found('Gadget')).toEqual([widget.id]);
    expect(await found('Red')).toEqual([widget.id]);
    // The archived field's already-stored value is not migrated away, so it
    // remains indexed until a migration explicitly drops it (search-index.ts /
    // catalogue-materialize.ts never filter an archived field out of a type's
    // `fields`, and no `drop_value` step ran here).
    expect(await found('Oak')).toEqual([widget.id]);
    // The computed field's new expression (x3, not x2) is what search now finds.
    expect(await found('1500')).toEqual([widget.id]);

    // A newly added field is usable immediately, no restart required.
    await applyAll([
      wireMutation(
        'item.edit',
        widget.id,
        { values: [{ fieldId: weightFieldId, values: [42] }] },
        { baseRevision: 3, catalogueRevision: revision2 }
      ),
    ]);
    expect(await found('42')).toEqual([widget.id]);

    // Containment is untouched by an unrelated catalogue republish.
    expect(await containerIdOf(widget.id)).toBe(box.id);
    expect(await childrenOf(box.id)).toEqual([widget.id]);
    expect(await childrenOf(crate.id)).toEqual([crateWidget.id]);

    // Revision 3a: removing containment from an occupied type is rejected,
    // even with a migration declared, because it would orphan the crate's
    // contents (src/catalogue/migrations.ts's assertContainmentCanChange).
    const draft3a = await createDraft(revision2);
    const patched3a = await patch(draft3a, [
      { kind: 'put_type', id: catalogue.crateTypeId, capabilities: [] },
    ]);
    expect(patched3a.body.types.find((t) => t.id === catalogue.crateTypeId)?.key).toBe('crate');
    const refused = await publish(patched3a.draft, {
      migration: {
        name: 'drop-crate-containment',
        fromRevision: revision2,
        toRevision: draft3a.revision,
        affectedTypeIds: [catalogue.crateTypeId],
        affectedFieldIds: [],
        steps: [],
      },
    });
    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.code).toBe('migration_containment_in_use');
    // The rejected publish changed nothing: the crate still holds its widget.
    expect(await childrenOf(crate.id)).toEqual([crateWidget.id]);
    expect(await containerIdOf(crateWidget.id)).toBe(crate.id);
    const abandoned = await api.post(`/type-catalogue/drafts/${draft3a.revision}/abandon`).send({
      baseRevision: draft3a.baseRevision,
      expectedDraftVersion: patched3a.draft.draftVersion,
    });
    expect(abandoned.status, JSON.stringify(abandoned.body)).toBe(200);

    // Revision 3b: removing containment from an empty type publishes, and
    // a subsequent placement into it is then rejected under the new rules.
    const draft3b = await createDraft(revision2);
    const patched3b = await patch(draft3b, [
      { kind: 'put_type', id: catalogue.binTypeId, capabilities: [] },
    ]);
    const revision3 = draft3b.revision;
    const published3 = await publish(patched3b.draft, {
      migration: {
        name: 'drop-bin-containment',
        fromRevision: revision2,
        toRevision: revision3,
        affectedTypeIds: [catalogue.binTypeId],
        affectedFieldIds: [],
        steps: [],
      },
    });
    expect(published3.status, JSON.stringify(published3.body)).toBe(200);

    // Search and the box's containment survive this migration untouched.
    expect(await found('Gadget')).toEqual([widget.id]);
    expect(await containerIdOf(widget.id)).toBe(box.id);

    const latecomer = createWidget(
      catalogue,
      'Latecomer widget',
      { fieldId: catalogue.colorFieldId, values: ['Ash grey'] },
      { kind: 'hand' }
    );
    await applyAll([{ ...latecomer.mutation, catalogueRevision: revision3 } as WireMutation]);
    const rejectedMove = await sendMutations([
      wireMutation(
        'item.move',
        latecomer.id,
        { to: { kind: 'container', itemId: bin.id }, verb: 'store' },
        { baseRevision: 1, catalogueRevision: revision3 }
      ),
    ]);
    expect(rejectedMove[0]).toMatchObject({ status: 'rejected', reason: 'not_container' });
    expect(await containerIdOf(latecomer.id)).toBe(null);

    // A live container (box) still accepts a placement under the same,
    // unchanged rule.
    const storeIntoBox = await sendMutations([
      wireMutation(
        'item.move',
        latecomer.id,
        { to: { kind: 'container', itemId: box.id }, verb: 'store' },
        { baseRevision: 1, catalogueRevision: revision3 }
      ),
    ]);
    expect(storeIntoBox[0]).toMatchObject({ status: 'applied' });
    expect(await containerIdOf(latecomer.id)).toBe(box.id);
    expect(await childrenOf(box.id).then((ids) => ids.toSorted())).toEqual(
      [widget.id, latecomer.id].toSorted()
    );
  });
});
