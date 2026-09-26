/**
 * Field default values over REST: which fields may declare one, the value
 * rules each entry passes at `put_field` time and in the whole-catalogue
 * sweep, compatibility neutrality, and that the server never applies one.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { PROTOCOL_2, send, wireMutation } from './sync-harness.js';
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

interface WireOption {
  readonly id: string;
  readonly key: string;
}

interface WireField {
  readonly id: string;
  readonly key: string;
  readonly defaultValues: unknown[];
  readonly enumOptions: WireOption[];
}

interface WireType {
  readonly id: string;
  readonly key: string;
  readonly fields: WireField[];
}

interface Kit {
  readonly draft: Draft;
  readonly typeId: string;
  readonly sizeFieldId: string;
  readonly smallId: string;
  readonly largeId: string;
  readonly retiredId: string;
}

beforeEach(async () => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-field-defaults-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  const rejectServiceAccount: ServiceAccountVerifier = () =>
    Promise.resolve({ outcome: 'rejected' });
  api = transport.requestOn(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
      serviceAccountVerifier: rejectServiceAccount,
      identityResolver: () =>
        Promise.resolve({ user: { email: 'owner@example.com' }, serviceAccount: null }),
    })
  );
  const rollout = await api
    .post('/type-catalogue/protocol-rollout')
    .send({ expectedMinimumProtocol: 1, minimumProtocol: 2 });
  expect(rollout.status, JSON.stringify(rollout.body)).toBe(200);
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

async function createDraft(): Promise<Draft> {
  const current = await api.get('/type-catalogue');
  const baseRevision = current.body.revision.revision as number;
  const created = await api.post('/type-catalogue/drafts').send({ baseRevision });
  expect(created.status, JSON.stringify(created.body)).toBe(201);
  return {
    revision: created.body.revision.revision,
    baseRevision,
    draftVersion: created.body.revision.draftVersion,
  };
}

function patchRequest(draft: Draft, operations: readonly unknown[]) {
  return api.patch(`/type-catalogue/drafts/${draft.revision}`).send({
    baseRevision: draft.baseRevision,
    expectedDraftVersion: draft.draftVersion,
    operations,
  });
}

async function patch(draft: Draft, operations: readonly unknown[]) {
  const response = await patchRequest(draft, operations);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return {
    draft: { ...draft, draftVersion: response.body.draft.revision.draftVersion as number },
    types: response.body.draft.types as WireType[],
  };
}

async function rejectedCodes(draft: Draft, operations: readonly unknown[]) {
  const response = await patchRequest(draft, operations);
  expect(response.status, JSON.stringify(response.body)).toBe(400);
  expect(response.body.code).toBe('catalogue_validation_failed');
  return (response.body.issues as { code: string; path: string }[]).map(
    (entry) => `${entry.path}:${entry.code}`
  );
}

function publish(draft: Draft, extra: Record<string, unknown> = {}) {
  return api.post(`/type-catalogue/drafts/${draft.revision}/publish`).send({
    baseRevision: draft.baseRevision,
    expectedDraftVersion: draft.draftVersion,
    ...extra,
  });
}

function typeOf(types: readonly WireType[], typeId: string): WireType {
  const type = types.find((entry) => entry.id === typeId);
  if (type === undefined) throw new Error(`type ${typeId} is missing`);
  return type;
}

function fieldOf(types: readonly WireType[], typeId: string, key: string): WireField {
  const field = typeOf(types, typeId).fields.find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`field ${key} is missing`);
  return field;
}

function optionId(field: WireField, key: string): string {
  const option = field.enumOptions.find((entry) => entry.key === key);
  if (option === undefined) throw new Error(`option ${key} is missing`);
  return option.id;
}

function storedField(typeId: string, key: string, extra: Record<string, unknown>) {
  return { kind: 'put_field', typeId, key, label: key, storage: 'stored', ...extra };
}

/** A `kit` type with a stored single-value enum `size` (small, large, retired archived). */
async function draftKit(): Promise<Kit> {
  const draft = await createDraft();
  const withType = await patch(draft, [{ kind: 'put_type', key: 'kit', label: 'Kit' }]);
  const typeId = withType.types.find((entry) => entry.key === 'kit')?.id;
  if (typeId === undefined) throw new Error('kit type is missing');
  const withField = await patch(withType.draft, [
    storedField(typeId, 'size', { fieldKind: 'enum', cardinality: 'one' }),
  ]);
  const sizeFieldId = fieldOf(withField.types, typeId, 'size').id;
  const withOptions = await patch(withField.draft, [
    { kind: 'put_enum_option', fieldId: sizeFieldId, key: 'small', label: 'Small' },
    { kind: 'put_enum_option', fieldId: sizeFieldId, key: 'large', label: 'Large' },
    { kind: 'put_enum_option', fieldId: sizeFieldId, key: 'retired', label: 'Retired' },
  ]);
  const size = fieldOf(withOptions.types, typeId, 'size');
  const retiredId = optionId(size, 'retired');
  const archived = await patch(withOptions.draft, [{ kind: 'archive_enum_option', id: retiredId }]);
  return {
    draft: archived.draft,
    typeId,
    sizeFieldId,
    smallId: optionId(size, 'small'),
    largeId: optionId(size, 'large'),
    retiredId,
  };
}

function setSizeDefault(kit: Kit, defaultValues: readonly unknown[]) {
  return { kind: 'put_field', id: kit.sizeFieldId, typeId: kit.typeId, defaultValues };
}

describe('field default values at authoring time', () => {
  it('accepts stored enum, measurement and many-valued defaults, in canonical form', async () => {
    const kit = await draftKit();
    const patched = await patch(kit.draft, [
      setSizeDefault(kit, [{ optionId: kit.smallId }]),
      storedField(kit.typeId, 'length', {
        fieldKind: 'measurement',
        cardinality: 'one',
        fixedUnit: 'cm',
        defaultValues: [{ amount: '12.5', unit: 'cm' }],
      }),
      storedField(kit.typeId, 'links', {
        fieldKind: 'url',
        cardinality: 'many',
        defaultValues: ['https://example.com', 'https://example.org/a'],
      }),
    ]);

    expect(fieldOf(patched.types, kit.typeId, 'size').defaultValues).toEqual([
      { optionId: kit.smallId },
    ]);
    expect(fieldOf(patched.types, kit.typeId, 'length').defaultValues).toEqual([
      { amount: '12.5', unit: 'cm' },
    ]);
    expect(fieldOf(patched.types, kit.typeId, 'links').defaultValues).toEqual([
      'https://example.com/',
      'https://example.org/a',
    ]);
  });

  it('keeps a default across an edit that omits it, and clears it with an empty list', async () => {
    const kit = await draftKit();
    const withDefault = await patch(kit.draft, [setSizeDefault(kit, [{ optionId: kit.largeId }])]);
    const relabelled = await patch(withDefault.draft, [
      { kind: 'put_field', id: kit.sizeFieldId, typeId: kit.typeId, label: 'Kit size' },
    ]);
    expect(fieldOf(relabelled.types, kit.typeId, 'size').defaultValues).toEqual([
      { optionId: kit.largeId },
    ]);

    const cleared = await patch(relabelled.draft, [setSizeDefault(kit, [])]);
    expect(fieldOf(cleared.types, kit.typeId, 'size').defaultValues).toEqual([]);
  });

  it('refuses a default on a computed field', async () => {
    const kit = await draftKit();
    expect(
      await rejectedCodes(kit.draft, [
        {
          kind: 'put_field',
          typeId: kit.typeId,
          key: 'label_text',
          label: 'Label text',
          fieldKind: 'short_text',
          cardinality: 'one',
          storage: 'computed',
          expressionVersion: 1,
          expression: { op: 'literal', value: 'kit' },
          allowOverride: true,
          defaultValues: ['kit'],
        },
      ])
    ).toEqual(['defaultValues:default_not_allowed']);
  });

  it('refuses a default on a reference field', async () => {
    const kit = await draftKit();
    expect(
      await rejectedCodes(kit.draft, [
        storedField(kit.typeId, 'stored_in', {
          fieldKind: 'reference',
          cardinality: 'one',
          referenceKinds: ['location'],
          defaultValues: [{ targetKind: 'location', targetId: randomUUID() }],
        }),
      ])
    ).toEqual(['defaultValues:default_not_allowed']);
  });

  it('refuses a measurement default in another unit', async () => {
    const kit = await draftKit();
    expect(
      await rejectedCodes(kit.draft, [
        storedField(kit.typeId, 'length', {
          fieldKind: 'measurement',
          cardinality: 'one',
          fixedUnit: 'cm',
          defaultValues: [{ amount: '12', unit: 'mm' }],
        }),
      ])
    ).toEqual(['defaultValues:default_invalid']);
  });

  it('refuses two defaults on a single-value field', async () => {
    const kit = await draftKit();
    expect(
      await rejectedCodes(kit.draft, [
        setSizeDefault(kit, [{ optionId: kit.smallId }, { optionId: kit.largeId }]),
      ])
    ).toEqual(['defaultValues:default_invalid']);
  });

  it('refuses a default naming an option the field does not declare', async () => {
    const kit = await draftKit();
    expect(
      await rejectedCodes(kit.draft, [setSizeDefault(kit, [{ optionId: randomUUID() }])])
    ).toEqual(['defaultValues:default_invalid']);
  });

  it('refuses a default naming an archived option when the put_field runs', async () => {
    const kit = await draftKit();
    expect(
      await rejectedCodes(kit.draft, [
        setSizeDefault(kit, [{ optionId: kit.retiredId }]),
        {
          kind: 'put_enum_option',
          id: kit.retiredId,
          fieldId: kit.sizeFieldId,
          archivedAt: null,
        },
      ])
    ).toEqual(['defaultValues:default_enum_option_archived']);
  });

  it('refuses archiving the option a default names, in the whole-catalogue sweep', async () => {
    const kit = await draftKit();
    const withDefault = await patch(kit.draft, [setSizeDefault(kit, [{ optionId: kit.smallId }])]);
    expect(
      await rejectedCodes(withDefault.draft, [{ kind: 'archive_enum_option', id: kit.smallId }])
    ).toEqual(['defaultValues:default_enum_option_archived']);
  });
});

describe('field default values at publication', () => {
  it('refuses to publish a default whose option was archived after it was set', async () => {
    const kit = await draftKit();
    const withDefault = await patch(kit.draft, [setSizeDefault(kit, [{ optionId: kit.smallId }])]);
    inventoryDb.raw
      .prepare(`UPDATE field_enum_options SET archived_at = 'now' WHERE revision = ? AND id = ?`)
      .run(kit.draft.revision, kit.smallId);

    const refused = await publish(withDefault.draft);

    expect(refused.status, JSON.stringify(refused.body)).toBe(400);
    expect(refused.body.code).toBe('catalogue_validation_failed');
    expect(refused.body.issues).toEqual([
      expect.objectContaining({
        definitionId: kit.sizeFieldId,
        path: 'defaultValues',
        code: 'default_enum_option_archived',
      }),
    ]);
  });

  it('publishes a changed default with no migration and no item re-send', async () => {
    const kit = await draftKit();
    const withDefault = await patch(kit.draft, [setSizeDefault(kit, [{ optionId: kit.smallId }])]);
    const first = await publish(withDefault.draft);
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const itemId = randomUUID();
    const created = await send(
      api,
      [
        wireMutation(
          'item.create',
          itemId,
          {
            item: {
              name: 'Kit',
              typeId: kit.typeId,
              values: [{ fieldId: kit.sizeFieldId, values: [{ optionId: kit.largeId }] }],
            },
          },
          { catalogueRevision: kit.draft.revision }
        ),
      ],
      PROTOCOL_2
    );
    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.outcomes[0], JSON.stringify(created.body)).toMatchObject({
      status: 'applied',
    });
    const eventsBefore = inventoryDb.raw.prepare('SELECT count(*) AS count FROM events').get();

    const next = await createDraft();
    const changed = await patch(next, [setSizeDefault(kit, [{ optionId: kit.largeId }])]);
    const preview = await api.post(`/type-catalogue/drafts/${next.revision}/preview`).send({
      baseRevision: next.baseRevision,
      expectedDraftVersion: changed.draft.draftVersion,
      operations: [],
    });
    expect(preview.status, JSON.stringify(preview.body)).toBe(200);
    expect(preview.body.compatibility).toMatchObject({
      classification: 'compatible',
      affectedIds: [],
      changes: [],
    });

    const published = await publish(changed.draft);

    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(inventoryDb.raw.prepare('SELECT count(*) AS count FROM events').get()).toEqual(
      eventsBefore
    );
  });
});

describe('field default values on item create', () => {
  it('stores no value for a defaulted field the create omits', async () => {
    const kit = await draftKit();
    const withDefault = await patch(kit.draft, [setSizeDefault(kit, [{ optionId: kit.smallId }])]);
    const published = await publish(withDefault.draft);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
    const itemId = randomUUID();

    const created = await send(
      api,
      [
        wireMutation(
          'item.create',
          itemId,
          { item: { name: 'Kit', typeId: kit.typeId, values: [] } },
          { catalogueRevision: kit.draft.revision }
        ),
      ],
      PROTOCOL_2
    );

    expect(created.status, JSON.stringify(created.body)).toBe(200);
    expect(created.body.outcomes[0], JSON.stringify(created.body)).toMatchObject({
      status: 'applied',
    });
    expect(
      inventoryDb.raw
        .prepare('SELECT count(*) AS count FROM item_field_values WHERE item_id = ?')
        .get(itemId)
    ).toEqual({ count: 0 });
    expect(
      inventoryDb.raw.prepare('SELECT type_id AS typeId FROM items WHERE id = ?').get(itemId)
    ).toEqual({ typeId: kit.typeId });
  });
});
