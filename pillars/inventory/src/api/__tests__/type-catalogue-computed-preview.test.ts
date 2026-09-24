/**
 * `POST /type-catalogue/drafts/:revision/computed-preview`: a draft computed
 * field evaluated on one chosen item, every outcome, every refusal, and proof
 * that nothing — draft, draft version, item, override, audit — is written.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { activatePersistedCatalogueProtocol } from '../../catalogue/__tests__/protocol-rollout-fixture.js';
import {
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../catalogue/authoring.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { granting, PROTOCOL_2, wireMutation, type WireMutation } from './sync-harness.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { CatalogueDescriptor } from '../../catalogue/authoring-types.js';
import type { CommandDb } from '../../domain/commands/entities.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
const transport = createTestTransport();

let dir: string;
let inventoryDb: OpenedInventoryDb;
let api: BoundAgent;

interface Ids {
  readonly revision: number;
  readonly partTypeId: string;
  readonly weightFieldId: string;
  readonly kitTypeId: string;
  readonly partFieldId: string;
  readonly countFieldId: string;
  readonly totalFieldId: string;
  readonly noteFieldId: string;
}

function target(draft: CatalogueDescriptor, baseRevision = 1) {
  return {
    revision: draft.revision.revision,
    baseRevision,
    expectedDraftVersion: draft.revision.draftVersion,
  };
}

function find(draft: CatalogueDescriptor, key: string, fieldKey?: string): string {
  const type = draft.types.find((entry) => entry.key === key);
  const id = fieldKey === undefined ? type?.id : type?.fields.find((f) => f.key === fieldKey)?.id;
  if (id === undefined) throw new Error(`${key}.${fieldKey ?? ''} was not created`);
  return id;
}

function stored(
  typeId: string,
  key: string,
  fieldKind: 'integer' | 'short_text' | 'reference',
  extra: object = {}
) {
  return {
    kind: 'put_field' as const,
    typeId,
    key,
    label: key,
    fieldKind,
    cardinality: 'one' as const,
    required: false,
    storage: 'stored' as const,
    ...extra,
  };
}

/** A part with a weight, and a kit reading it: `total` is `part.weight × count`. */
function publish(db: CommandDb): Ids {
  const created = createCatalogueDraft(db, 1, AUTHOR);
  const types = patchCatalogueDraft(db, target(created), [
    { kind: 'put_type', key: 'part', label: 'Part' },
    { kind: 'put_type', key: 'kit', label: 'Kit' },
  ]).draft;
  const partTypeId = find(types, 'part');
  const kitTypeId = find(types, 'kit');
  const fields = patchCatalogueDraft(db, target(types), [
    stored(partTypeId, 'weight', 'integer'),
    stored(kitTypeId, 'count', 'integer'),
    stored(kitTypeId, 'note', 'short_text'),
    stored(kitTypeId, 'part', 'reference', {
      referenceKinds: ['item'],
      referenceTypeIds: [partTypeId],
    }),
  ]).draft;
  const weightFieldId = find(fields, 'part', 'weight');
  const partFieldId = find(fields, 'kit', 'part');
  const countFieldId = find(fields, 'kit', 'count');
  const withTotal = patchCatalogueDraft(db, target(fields), [
    {
      ...stored(kitTypeId, 'total', 'integer'),
      storage: 'computed',
      expressionVersion: 1,
      expression: {
        op: 'multiply',
        left: { op: 'read', path: [partFieldId], fieldId: weightFieldId },
        right: { op: 'read', path: [], fieldId: countFieldId },
      },
      allowOverride: true,
    },
  ]).draft;
  activatePersistedCatalogueProtocol(db);
  publishCatalogueDraft(
    db,
    created.revision.revision,
    { baseRevision: 1, expectedDraftVersion: withTotal.revision.draftVersion, note: null },
    AUTHOR
  );
  return {
    revision: created.revision.revision,
    partTypeId,
    weightFieldId,
    kitTypeId,
    partFieldId,
    countFieldId,
    totalFieldId: find(withTotal, 'kit', 'total'),
    noteFieldId: find(withTotal, 'kit', 'note'),
  };
}

async function apply(mutation: WireMutation): Promise<void> {
  const response = await api
    .post('/sync/mutations')
    .set(PROTOCOL_2)
    .send({ mutations: [mutation] });
  expect(response.body.outcomes[0]).toMatchObject({ status: 'applied' });
}

interface Fixture {
  readonly ids: Ids;
  readonly draft: CatalogueDescriptor;
  readonly partId: string;
  readonly kitId: string;
}

async function setup(
  options: { weight?: number; count?: number | null; override?: number } = {}
): Promise<Fixture> {
  const ids = publish(inventoryDb.db);
  const partId = randomUUID();
  const kitId = randomUUID();
  const partValues =
    options.weight === undefined ? [] : [{ fieldId: ids.weightFieldId, values: [options.weight] }];
  await apply(
    wireMutation(
      'item.create',
      partId,
      { item: { name: 'Hinge', typeId: ids.partTypeId, values: partValues } },
      { catalogueRevision: ids.revision }
    )
  );
  await apply(
    wireMutation(
      'item.create',
      kitId,
      {
        item: {
          name: 'Cabinet kit',
          typeId: ids.kitTypeId,
          values: [
            { fieldId: ids.partFieldId, values: [{ targetKind: 'item', targetId: partId }] },
            ...(options.count === null
              ? []
              : [{ fieldId: ids.countFieldId, values: [options.count ?? 4] }]),
          ],
        },
      },
      { catalogueRevision: ids.revision }
    )
  );
  if (options.override !== undefined)
    await apply(
      wireMutation(
        'item.setOverride',
        kitId,
        { fieldId: ids.totalFieldId, values: [options.override] },
        { baseRevision: 1, catalogueRevision: ids.revision }
      )
    );
  const draft = createCatalogueDraft(inventoryDb.db, ids.revision, AUTHOR);
  return { ids, draft, partId, kitId };
}

function preview(fixture: Fixture, body: Record<string, unknown> = {}) {
  return api
    .post(`/type-catalogue/drafts/${fixture.draft.revision.revision}/computed-preview`)
    .send({
      baseRevision: fixture.ids.revision,
      expectedDraftVersion: fixture.draft.revision.draftVersion,
      typeId: fixture.ids.kitTypeId,
      field: { id: fixture.ids.totalFieldId },
      itemId: fixture.kitId,
      ...body,
    });
}

function totalExpression(fixture: Fixture, expression: unknown) {
  return [
    {
      kind: 'put_field',
      id: fixture.ids.totalFieldId,
      typeId: fixture.ids.kitTypeId,
      expressionVersion: 1,
      expression,
    },
  ];
}

function snapshotRows() {
  const raw = inventoryDb.raw;
  return {
    revisions: raw.prepare('SELECT * FROM catalogue_revisions ORDER BY revision').all(),
    fields: raw.prepare('SELECT * FROM item_type_fields ORDER BY revision, id').all(),
    items: raw.prepare('SELECT * FROM items ORDER BY id').all(),
    values: raw.prepare('SELECT * FROM item_field_values ORDER BY item_id, field_id').all(),
    catalogueEvents: raw.prepare('SELECT * FROM catalogue_events ORDER BY id').all(),
    itemEvents: raw.prepare('SELECT * FROM events ORDER BY rowid').all(),
    dependencies: raw.prepare('SELECT * FROM item_computed_dependencies ORDER BY 1, 2').all(),
    enumOptions: raw.prepare('SELECT * FROM field_enum_options ORDER BY rowid').all(),
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'inventory-computed-preview-'));
  inventoryDb = openInventoryDb(join(dir, 'inventory.db'));
  api = transport.requestOn(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
      serviceAccountVerifier: granting([]),
      identityResolver: () =>
        Promise.resolve({ user: { email: 'owner@example.com' }, serviceAccount: null }),
    })
  );
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(dir, { recursive: true, force: true });
});

describe('computed-field preview', () => {
  it('evaluates the draft expression through a reference and names every item it read', async () => {
    const fixture = await setup({ weight: 3, count: 4 });

    const response = await preview(fixture);

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      draftRevision: fixture.draft.revision.revision,
      draftVersion: fixture.draft.revision.draftVersion,
      fieldId: fixture.ids.totalFieldId,
      itemId: fixture.kitId,
      override: null,
      result: {
        state: 'value',
        value: 12,
        traversedItemIds: [fixture.kitId, fixture.partId],
      },
      items: [
        { id: fixture.kitId, name: 'Cabinet kit', typeId: fixture.ids.kitTypeId },
        { id: fixture.partId, name: 'Hinge', typeId: fixture.ids.partTypeId },
      ],
    });
    expect(response.body.result.dependencies).toEqual(
      expect.arrayContaining([
        { itemId: fixture.kitId, fieldId: fixture.ids.partFieldId, revision: 1 },
        { itemId: fixture.partId, fieldId: fixture.ids.weightFieldId, revision: 1 },
        { itemId: fixture.kitId, fieldId: fixture.ids.countFieldId, revision: 1 },
      ])
    );
  });

  it('applies unsaved operations to the evaluation and leaves every row untouched', async () => {
    const fixture = await setup({ weight: 3, count: 4, override: 99 });
    const before = snapshotRows();

    const response = await preview(fixture, {
      operations: totalExpression(fixture, {
        op: 'add',
        left: { op: 'read', path: [], fieldId: fixture.ids.countFieldId },
        right: { op: 'literal', value: 1 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ state: 'value', value: 5 });
    expect(response.body.override).toBe(99);
    expect(snapshotRows()).toEqual(before);
    const again = await preview(fixture);
    expect(again.status).toBe(200);
    expect(again.body.result).toMatchObject({ state: 'value', value: 12 });
  });

  it('names the missing input and the item it was read on', async () => {
    const fixture = await setup({ count: 4 });

    const response = await preview(fixture);

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      state: 'unavailable',
      missingInputs: [
        {
          fieldId: fixture.ids.weightFieldId,
          itemId: fixture.partId,
          reason: 'missing_dependency',
        },
      ],
      traversedItemIds: [fixture.kitId, fixture.partId],
    });
    expect(response.body.items.map((item: { name: string }) => item.name)).toEqual([
      'Cabinet kit',
      'Hinge',
    ]);
  });

  it('names every input a coalesce lacked, not only the last one it tried', async () => {
    const fixture = await setup({ count: null });

    const response = await preview(fixture, {
      operations: totalExpression(fixture, {
        op: 'coalesce',
        values: [
          { op: 'read', path: [fixture.ids.partFieldId], fieldId: fixture.ids.weightFieldId },
          { op: 'read', path: [], fieldId: fixture.ids.countFieldId },
        ],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      state: 'unavailable',
      missingInputs: [
        {
          fieldId: fixture.ids.weightFieldId,
          itemId: fixture.partId,
          reason: 'missing_dependency',
        },
        {
          fieldId: fixture.ids.countFieldId,
          itemId: fixture.kitId,
          reason: 'missing_dependency',
        },
      ],
    });
  });

  it('gives each input a coalesce lacked its own reason', async () => {
    const fixture = await setup({ weight: 3, count: null });
    await apply(
      wireMutation(
        'item.delete',
        fixture.partId,
        {},
        { baseRevision: 1, catalogueRevision: fixture.ids.revision }
      )
    );

    const response = await preview(fixture, {
      operations: totalExpression(fixture, {
        op: 'coalesce',
        values: [
          { op: 'read', path: [fixture.ids.partFieldId], fieldId: fixture.ids.weightFieldId },
          { op: 'read', path: [], fieldId: fixture.ids.countFieldId },
        ],
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body.result.missing).toEqual([
      expect.objectContaining({ fieldId: fixture.ids.weightFieldId, reason: 'reference_deleted' }),
      { fieldId: fixture.ids.countFieldId, itemId: fixture.kitId, reason: 'missing_dependency' },
    ]);
  });

  it('reports a reference to a deleted item', async () => {
    const fixture = await setup({ weight: 3 });
    await apply(
      wireMutation(
        'item.delete',
        fixture.partId,
        {},
        { baseRevision: 1, catalogueRevision: fixture.ids.revision }
      )
    );

    const response = await preview(fixture);

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({
      state: 'unavailable',
      missingInputs: [expect.objectContaining({ reason: 'reference_deleted' })],
    });
  });

  it('returns the raw evaluation error code rather than degrading it', async () => {
    const fixture = await setup({ weight: 3 });

    const response = await preview(fixture, {
      operations: totalExpression(fixture, {
        op: 'divide',
        left: { op: 'read', path: [], fieldId: fixture.ids.countFieldId },
        right: { op: 'literal', value: 0 },
      }),
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ state: 'error', code: 'division_by_zero' });
  });

  it('evaluates a new unsaved field addressed by key', async () => {
    const fixture = await setup({ weight: 3, count: 4 });

    const response = await preview(fixture, {
      operations: [
        {
          ...stored(fixture.ids.kitTypeId, 'doubled', 'integer'),
          storage: 'computed',
          expressionVersion: 1,
          expression: {
            op: 'add',
            left: { op: 'read', path: [], fieldId: fixture.ids.countFieldId },
            right: { op: 'read', path: [], fieldId: fixture.ids.countFieldId },
          },
          allowOverride: false,
        },
      ],
      field: { key: 'doubled' },
    });

    expect(response.status).toBe(200);
    expect(response.body.result).toMatchObject({ state: 'value', value: 8 });
    const field = inventoryDb.raw
      .prepare("SELECT id FROM item_type_fields WHERE key = 'doubled'")
      .get();
    expect(field).toBeUndefined();
  });

  it('refuses an invalid expression with the issue path a save would return', async () => {
    const fixture = await setup({ weight: 3 });

    const response = await preview(fixture, {
      operations: totalExpression(fixture, {
        op: 'add',
        left: { op: 'read', path: [], fieldId: fixture.ids.countFieldId },
        right: { op: 'read', path: [], fieldId: fixture.ids.noteFieldId },
      }),
    });

    expect(response.status).toBe(400);
    expect(response.body.issues).toEqual([
      expect.objectContaining({
        definitionId: fixture.ids.totalFieldId,
        path: 'expression.right',
      }),
    ]);
  });

  it('refuses a stale draft version with the current one', async () => {
    const fixture = await setup({ weight: 3 });
    patchCatalogueDraft(inventoryDb.db, target(fixture.draft, fixture.ids.revision), [
      { kind: 'put_type', id: fixture.ids.kitTypeId, label: 'Kit set' },
    ]);

    const response = await preview(fixture);

    expect(response.status).toBe(409);
    expect(response.body).toMatchObject({
      code: 'catalogue_draft_conflict',
      currentDraftVersion: fixture.draft.revision.draftVersion + 1,
    });
  });

  it.each([
    ['an unknown item', { itemId: 'no-such-item' }, 404, 'preview_item_unknown'],
    ['an unknown field', { field: { id: randomUUID() } }, 404, 'preview_field_unknown'],
    ['an unknown type', { typeId: randomUUID() }, 404, 'preview_type_unknown'],
  ])('refuses %s', async (_name, body, status, code) => {
    const fixture = await setup({ weight: 3 });

    const response = await preview(fixture, body);

    expect(response.status).toBe(status);
    expect(response.body.code).toBe(code);
  });

  it('refuses a stored field and an item of another type', async () => {
    const fixture = await setup({ weight: 3 });

    const stored = await preview(fixture, { field: { id: fixture.ids.countFieldId } });
    const otherType = await preview(fixture, { itemId: fixture.partId });

    expect(stored.status).toBe(400);
    expect(stored.body.code).toBe('preview_field_not_computed');
    expect(otherType.status).toBe(400);
    expect(otherType.body.code).toBe('preview_item_type_mismatch');
  });
});
