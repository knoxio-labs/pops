/**
 * Publication policy over REST: the protocol gate on new vocabulary, and the
 * computed-field classification (derived values publish compatibly; disabling
 * overrides that items hold needs a migration that discards and audits them).
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

interface DraftField {
  readonly id: string;
  readonly key: string;
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-publish-policy-test-'));
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

async function patch(draft: Draft, operations: readonly unknown[]) {
  const response = await api.patch(`/type-catalogue/drafts/${draft.revision}`).send({
    baseRevision: draft.baseRevision,
    expectedDraftVersion: draft.draftVersion,
    operations,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return {
    draft: { ...draft, draftVersion: response.body.draft.revision.draftVersion as number },
    body: response.body,
  };
}

function publish(draft: Draft, extra: Record<string, unknown> = {}) {
  return api.post(`/type-catalogue/drafts/${draft.revision}/publish`).send({
    baseRevision: draft.baseRevision,
    expectedDraftVersion: draft.draftVersion,
    ...extra,
  });
}

function fieldsOf(body: { types: { id: string; fields: DraftField[] }[] }, typeId: string) {
  const type = body.types.find((entry) => entry.id === typeId);
  if (type === undefined) throw new Error(`type ${typeId} is missing`);
  return type.fields;
}

function fieldId(
  body: { types: { id: string; fields: DraftField[] }[] },
  typeId: string,
  key: string
) {
  const field = fieldsOf(body, typeId).find((entry) => entry.key === key);
  if (field === undefined) throw new Error(`field ${key} is missing`);
  return field.id;
}

function computedBoolean(typeId: string, key: string, expression: unknown, allowOverride: boolean) {
  return {
    kind: 'put_field',
    typeId,
    key,
    label: key,
    fieldKind: 'boolean',
    cardinality: 'one',
    required: false,
    storage: 'computed',
    expressionVersion: 1,
    expression,
    allowOverride,
  };
}

function firstAvailable(chargedFieldId: string) {
  return {
    op: 'coalesce',
    values: [
      { op: 'read', path: [], fieldId: chargedFieldId },
      { op: 'literal', value: false },
    ],
  };
}

interface Gadget {
  readonly revision: number;
  readonly typeId: string;
  readonly chargedFieldId: string;
  readonly readyFieldId: string;
  readonly lockedFieldId: string;
}

/**
 * Publishes a `gadget` type with a stored boolean `charged`, an overridable
 * computed `ready = coalesce(charged, false)` and a non-overridable `locked`
 * with the same expression. Boolean is bootstrap vocabulary, so this publishes
 * while protocol 1 is still the rollout minimum.
 */
async function publishGadget(): Promise<Gadget> {
  const draft = await createDraft();
  const withType = await patch(draft, [{ kind: 'put_type', key: 'gadget', label: 'Gadget' }]);
  const typeId = withType.body.draft.types.find((entry: { key: string }) => entry.key === 'gadget')
    .id as string;
  const withCharged = await patch(withType.draft, [
    {
      kind: 'put_field',
      typeId,
      key: 'charged',
      label: 'Charged',
      fieldKind: 'boolean',
      cardinality: 'one',
      required: false,
      storage: 'stored',
    },
  ]);
  const chargedFieldId = fieldId(withCharged.body.draft, typeId, 'charged');
  const withComputed = await patch(withCharged.draft, [
    computedBoolean(typeId, 'ready', firstAvailable(chargedFieldId), true),
    computedBoolean(typeId, 'locked', firstAvailable(chargedFieldId), false),
  ]);
  const published = await publish(withComputed.draft);
  expect(published.status, JSON.stringify(published.body)).toBe(200);
  return {
    revision: draft.revision,
    typeId,
    chargedFieldId,
    readyFieldId: fieldId(withComputed.body.draft, typeId, 'ready'),
    lockedFieldId: fieldId(withComputed.body.draft, typeId, 'locked'),
  };
}

async function createGadget(gadget: Gadget, override?: boolean): Promise<string> {
  const id = randomUUID();
  const mutations = [
    wireMutation(
      'item.create',
      id,
      { item: { name: 'Gadget', typeId: gadget.typeId, values: [] } },
      { catalogueRevision: gadget.revision }
    ),
  ];
  if (override !== undefined) {
    mutations.push(
      wireMutation(
        'item.setOverride',
        id,
        { fieldId: gadget.readyFieldId, values: [override] },
        { baseRevision: 1, catalogueRevision: gadget.revision }
      )
    );
  }
  const response = await send(api, mutations, PROTOCOL_2);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  for (const outcome of response.body.outcomes)
    expect(outcome, JSON.stringify(outcome)).toMatchObject({ status: 'applied' });
  return id;
}

async function activateProtocol2(): Promise<void> {
  const response = await api
    .post('/type-catalogue/protocol-rollout')
    .send({ expectedMinimumProtocol: 1, minimumProtocol: 2 });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
}

function overrideRows(fieldIdValue: string): unknown {
  return inventoryDb.raw
    .prepare(
      `SELECT count(*) AS count FROM item_field_values WHERE field_id = ? AND source = 'override'`
    )
    .get(fieldIdValue);
}

function snapshotDatabase(): Record<string, unknown[]> {
  const tables = inventoryDb.raw
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name`)
    .pluck()
    .all();
  return Object.fromEntries(
    tables.map((table) => [
      String(table),
      inventoryDb.raw.prepare(`SELECT * FROM "${String(table)}"`).all(),
    ])
  );
}

describe('the non-mutating draft preview', () => {
  it('leaves every table unchanged after allowed, migration-required and rejected previews', async () => {
    await activateProtocol2();
    const gadget = await publishGadget();
    await createGadget(gadget, true);
    const draft = await createDraft();
    const before = snapshotDatabase();
    const previewOf = (operations: readonly unknown[]) =>
      api.post(`/type-catalogue/drafts/${draft.revision}/preview`).send({
        baseRevision: draft.baseRevision,
        expectedDraftVersion: draft.draftVersion,
        operations,
      });

    const allowed = await previewOf([
      { kind: 'put_type', id: gadget.typeId, label: 'Renamed gadget' },
    ]);
    const migrationRequired = await previewOf([
      { kind: 'put_field', id: gadget.readyFieldId, typeId: gadget.typeId, allowOverride: false },
    ]);
    const rejected = await previewOf([
      {
        kind: 'put_field',
        id: gadget.chargedFieldId,
        typeId: gadget.typeId,
        fieldKind: 'short_text',
      },
    ]);

    expect(allowed.status).toBe(200);
    expect(allowed.body.compatibility.classification).toBe('compatible');
    expect(migrationRequired.status).toBe(200);
    expect(migrationRequired.body.compatibility).toMatchObject({
      classification: 'migration_required',
      discardedOverrides: [{ fieldId: gadget.readyFieldId, items: 1 }],
    });
    expect(rejected.status, JSON.stringify(rejected.body)).toBe(400);
    expect(rejected.body.preview.compatibility.classification).toBe('forbidden');
    expect(snapshotDatabase()).toEqual(before);
  });
});

describe('the publication protocol gate over REST', () => {
  it('answers 409 protocol_rollout_required until protocol 2 is active, then publishes at protocol 2', async () => {
    const current = await api.get('/type-catalogue');
    const typeId = current.body.types[0].id as string;
    const draft = await createDraft();
    const patched = await patch(draft, [
      {
        kind: 'put_field',
        typeId,
        key: 'checked_on',
        label: 'Checked on',
        fieldKind: 'date',
        cardinality: 'one',
        required: false,
        storage: 'stored',
      },
    ]);

    const refused = await publish(patched.draft);

    expect(refused.status, JSON.stringify(refused.body)).toBe(409);
    expect(refused.body.code).toBe('protocol_rollout_required');
    expect(refused.body.preview).toMatchObject({
      baseRevision: draft.baseRevision,
      draftRevision: draft.revision,
      compatibility: { classification: 'protocol_gated' },
    });
    expect(refused.body.preview.compatibility.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ classification: 'protocol_gated', code: 'primitive_kind_added' }),
        expect.objectContaining({ code: 'minimum_protocol_increased' }),
      ])
    );
    expect((await api.get('/type-catalogue')).body.revision.revision).toBe(draft.baseRevision);

    await activateProtocol2();
    const published = await publish(patched.draft);

    expect(published.status, JSON.stringify(published.body)).toBe(200);
    expect(published.body.revision).toMatchObject({ status: 'published', minimumProtocol: 2 });
  });
});

describe('computed-field publication policy over REST', () => {
  it('publishes a new computed field whose expression uses coalesce as compatible, at protocol 1', async () => {
    const gadget = await publishGadget();

    const catalogue = await api.get('/type-catalogue');
    const rollout = await api.get('/type-catalogue/protocol-rollout');

    expect(catalogue.body.revision).toMatchObject({
      revision: gadget.revision,
      minimumProtocol: 1,
    });
    expect(rollout.body.minimumProtocol).toBe(1);
  });

  it('publishes an added computed field, an expression change and enabled overrides without a migration', async () => {
    const gadget = await publishGadget();
    await createGadget(gadget);
    const draft = await createDraft();

    const patched = await patch(draft, [
      {
        kind: 'put_field',
        id: gadget.lockedFieldId,
        typeId: gadget.typeId,
        expression: { op: 'not', value: firstAvailable(gadget.chargedFieldId) },
        allowOverride: true,
      },
      computedBoolean(gadget.typeId, 'spare', firstAvailable(gadget.chargedFieldId), false),
    ]);

    expect(patched.body.compatibility).toMatchObject({
      classification: 'compatible',
      affectedItems: 1,
      discardedOverrides: [],
      changes: [
        { definitionId: gadget.lockedFieldId, code: 'computed_expression_changed' },
        { definitionId: gadget.lockedFieldId, code: 'computed_overrides_enabled' },
        { code: 'computed_field_added' },
      ],
    });
    const published = await publish(patched.draft);
    expect(published.status, JSON.stringify(published.body)).toBe(200);
  });

  it('disables overrides compatibly when no item holds one', async () => {
    const gadget = await publishGadget();
    await createGadget(gadget);
    const draft = await createDraft();

    const patched = await patch(draft, [
      { kind: 'put_field', id: gadget.readyFieldId, typeId: gadget.typeId, allowOverride: false },
    ]);

    expect(patched.body.compatibility).toMatchObject({
      classification: 'compatible',
      discardedOverrides: [],
      changes: [{ definitionId: gadget.readyFieldId, code: 'computed_overrides_disabled' }],
    });
    expect((await publish(patched.draft)).status).toBe(200);
  });

  describe('disabling overrides that items hold', () => {
    async function prepare() {
      await activateProtocol2();
      const gadget = await publishGadget();
      const overridden = [await createGadget(gadget, true), await createGadget(gadget, false)];
      await createGadget(gadget);
      const draft = await createDraft();
      const operation = {
        kind: 'put_field',
        id: gadget.readyFieldId,
        typeId: gadget.typeId,
        allowOverride: false,
      };
      return { gadget, draft, operation, overridden };
    }

    it('previews migration_required with the number of items holding an override, without writing', async () => {
      const { gadget, draft, operation } = await prepare();

      const preview = await api.post(`/type-catalogue/drafts/${draft.revision}/preview`).send({
        baseRevision: draft.baseRevision,
        expectedDraftVersion: draft.draftVersion,
        operations: [operation],
      });

      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      expect(preview.body.compatibility).toMatchObject({
        classification: 'migration_required',
        affectedItems: 3,
        discardedOverrides: [{ fieldId: gadget.readyFieldId, items: 2 }],
        changes: [
          {
            classification: 'migration_required',
            definitionId: gadget.readyFieldId,
            code: 'computed_overrides_in_use',
          },
        ],
      });
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 2 });
    });

    it('refuses publication without a migration and reports the overrides it would discard', async () => {
      const { gadget, draft, operation } = await prepare();
      const patched = await patch(draft, [operation]);

      const refused = await publish(patched.draft);

      expect(refused.status, JSON.stringify(refused.body)).toBe(409);
      expect(refused.body.code).toBe('catalogue_migration_required');
      expect(refused.body.preview.compatibility.discardedOverrides).toEqual([
        { fieldId: gadget.readyFieldId, items: 2 },
      ]);
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 2 });
    });

    it('discards them through a declared drop_value migration, auditing each changed item', async () => {
      const { gadget, draft, operation, overridden } = await prepare();
      const patched = await patch(draft, [operation]);

      const published = await publish(patched.draft, {
        migration: {
          name: 'discard-ready-overrides',
          fromRevision: draft.baseRevision,
          toRevision: draft.revision,
          affectedTypeIds: [gadget.typeId],
          affectedFieldIds: [gadget.readyFieldId],
          steps: [{ kind: 'drop_value', fieldId: gadget.readyFieldId }],
        },
      });

      expect(published.status, JSON.stringify(published.body)).toBe(200);
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 0 });
      expect(
        inventoryDb.raw
          .prepare(
            `SELECT entity_id AS itemId, reason FROM events
             WHERE kind = 'migrated' ORDER BY entity_id`
          )
          .all()
      ).toEqual(
        overridden.toSorted().map((itemId) => ({ itemId, reason: 'discard-ready-overrides' }))
      );
      const audit = await api.get('/type-catalogue/audit').query({ limit: 1 });
      expect(audit.body.events[0]).toMatchObject({
        revision: draft.revision,
        kind: 'published',
        migrationName: 'discard-ready-overrides',
        affectedItems: 2,
      });
    });

    it('does not migrate a soft-deleted item holding an override, but drops it on restore', async () => {
      const { gadget, draft, operation, overridden } = await prepare();
      const deletedItemId = overridden[0];
      if (deletedItemId === undefined) throw new Error('prepare() did not seed an overridden item');

      await send(
        api,
        [wireMutation('item.delete', deletedItemId, {}, { baseRevision: 2 })],
        PROTOCOL_2
      );
      const patched = await patch(draft, [operation]);
      const published = await publish(patched.draft, {
        migration: {
          name: 'discard-ready-overrides',
          fromRevision: draft.baseRevision,
          toRevision: draft.revision,
          affectedTypeIds: [gadget.typeId],
          affectedFieldIds: [gadget.readyFieldId],
          steps: [{ kind: 'drop_value', fieldId: gadget.readyFieldId }],
        },
      });
      expect(published.status, JSON.stringify(published.body)).toBe(200);

      // The soft-deleted item is invisible to the migration, so its override survives publication.
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 1 });

      const restore = await send(
        api,
        [wireMutation('item.restoreDeleted', deletedItemId, {}, { baseRevision: null })],
        PROTOCOL_2
      );
      expect(restore.body.outcomes[0], JSON.stringify(restore.body)).toMatchObject({
        status: 'applied',
      });

      // Restoring the item cannot resurrect an override the active catalogue no longer allows.
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 0 });
      const restored = inventoryDb.raw
        .prepare(`SELECT deleted_at AS deletedAt FROM items WHERE id = ?`)
        .get(deletedItemId);
      expect(restored).toMatchObject({ deletedAt: null });
    });

    /**
     * POPS-4527: `findDiscardedOverrides` filters live items only
     * (`isNull(items.deletedAt)`), so the compatibility preview's
     * `discardedOverrides` count never includes a deleted item's override.
     * This test proves that undercount is informational only: `restoreDeleted`
     * independently strips a since-disallowed override (POPS-4398), keyed off
     * the CURRENT published catalogue rather than the preview's evidence, so a
     * deleted holder can never resurface with a forbidden override after the
     * field is disabled and the item is restored. It is a permanent regression
     * test, not a fix — `findDiscardedOverrides` is unchanged.
     */
    it('excludes a deleted holder from the preview count, but still strips its override on restore', async () => {
      const { gadget, draft, operation, overridden } = await prepare();
      const deletedItemId = overridden[0];
      if (deletedItemId === undefined) throw new Error('prepare() did not seed an overridden item');

      await send(
        api,
        [wireMutation('item.delete', deletedItemId, {}, { baseRevision: 2 })],
        PROTOCOL_2
      );

      const preview = await api.post(`/type-catalogue/drafts/${draft.revision}/preview`).send({
        baseRevision: draft.baseRevision,
        expectedDraftVersion: draft.draftVersion,
        operations: [operation],
      });
      expect(preview.status, JSON.stringify(preview.body)).toBe(200);
      // The deleted item still holds an override, but the preview only counts
      // the one live holder left: the informational evidence undercounts by one.
      expect(preview.body.compatibility).toMatchObject({
        classification: 'migration_required',
        discardedOverrides: [{ fieldId: gadget.readyFieldId, items: 1 }],
      });
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 2 });

      const patched = await patch(draft, [operation]);
      const published = await publish(patched.draft, {
        migration: {
          name: 'discard-ready-overrides',
          fromRevision: draft.baseRevision,
          toRevision: draft.revision,
          affectedTypeIds: [gadget.typeId],
          affectedFieldIds: [gadget.readyFieldId],
          steps: [{ kind: 'drop_value', fieldId: gadget.readyFieldId }],
        },
      });
      expect(published.status, JSON.stringify(published.body)).toBe(200);
      // The live holder's override was migrated away; the deleted holder's
      // override survives publication because it is invisible to the migration.
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 1 });

      const restore = await send(
        api,
        [wireMutation('item.restoreDeleted', deletedItemId, {}, { baseRevision: null })],
        PROTOCOL_2
      );
      expect(restore.body.outcomes[0], JSON.stringify(restore.body)).toMatchObject({
        status: 'applied',
      });

      // The invariant holds despite the preview's undercount: no override on
      // a field the active catalogue disallows survives the restore.
      expect(overrideRows(gadget.readyFieldId)).toEqual({ count: 0 });
      const restoredValue = inventoryDb.raw
        .prepare(`SELECT source FROM item_field_values WHERE item_id = ? AND field_id = ?`)
        .all(deletedItemId, gadget.readyFieldId);
      expect(restoredValue).toEqual([]);
    });
  });
});
