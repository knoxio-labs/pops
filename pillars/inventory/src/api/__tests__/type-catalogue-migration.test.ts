import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

import type { CatalogueMigrationStep } from '../../catalogue/migrations.js';

const transport = createTestTransport();
const REQUIRED_TYPE_KEYS = ['cable', 'charger'] as const;
const REQUIRED_TYPE_KEY_SET = new Set<string>(REQUIRED_TYPE_KEYS);

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

interface PreparedMigration {
  readonly api: BoundAgent;
  readonly baseRevision: number;
  readonly draftRevision: number;
  readonly draftVersion: number;
  readonly affectedTypeIds: readonly string[];
  readonly affectedFieldIds: readonly string[];
  readonly steps: readonly CatalogueMigrationStep[];
  readonly unrelatedTypeId: string;
  readonly unrelatedFieldId: string;
}

interface PreparedContainmentMigration {
  readonly api: BoundAgent;
  readonly baseRevision: number;
  readonly draftRevision: number;
  readonly draftVersion: number;
  readonly typeId: string;
}

function apiForOwner(): BoundAgent {
  const rejectServiceAccount: ServiceAccountVerifier = () =>
    Promise.resolve({ outcome: 'rejected' });
  return transport.requestOn(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
      serviceAccountVerifier: rejectServiceAccount,
      identityResolver: () =>
        Promise.resolve({ user: { email: 'owner@example.com' }, serviceAccount: null }),
    })
  );
}

function seedAffectedItem(id: string, typeId: string): void {
  inventoryDb.raw
    .prepare(
      `INSERT INTO items (id, name, type_id, placement_kind, last_edited_time, seq)
       VALUES (?, ?, ?, 'hand', '2026-09-23T00:00:00.000Z', 1)`
    )
    .run(id, id, typeId);
}

async function prepareRequiredFieldMigration(seedItems = true): Promise<PreparedMigration> {
  const api = apiForOwner();
  const current = await api.get('/type-catalogue');
  const baseRevision = current.body.revision.revision as number;
  const affectedTypes = REQUIRED_TYPE_KEYS.map((key) => {
    const type = current.body.types.find((entry: { key: string }) => entry.key === key);
    if (!type) throw new Error(`missing built-in type ${key}`);
    return type as { id: string; key: string };
  });
  const unrelatedType = current.body.types.find(
    (entry: { key: string }) => !REQUIRED_TYPE_KEY_SET.has(entry.key)
  ) as { id: string; fields: { id: string }[] } | undefined;
  const unrelatedField = unrelatedType?.fields[0];
  if (!unrelatedType || !unrelatedField) throw new Error('missing unrelated catalogue definition');
  if (seedItems) {
    affectedTypes.forEach((type, index) => seedAffectedItem(`affected-${index}`, type.id));
  }

  const created = await api.post('/type-catalogue/drafts').send({ baseRevision });
  const draftRevision = created.body.revision.revision as number;
  const fieldKeys = affectedTypes.map((type) => `required_${type.key}`);
  const patch = await api.patch(`/type-catalogue/drafts/${draftRevision}`).send({
    baseRevision,
    expectedDraftVersion: created.body.revision.draftVersion,
    operations: affectedTypes.map((type, index) => ({
      kind: 'put_field',
      typeId: type.id,
      key: fieldKeys[index],
      label: `Required ${type.key}`,
      fieldKind: 'short_text',
      cardinality: 'one',
      required: true,
      storage: 'stored',
    })),
  });
  const affectedFieldIds = affectedTypes.map((type, index) => {
    const draftType = patch.body.draft.types.find(
      (entry: { id: string }) => entry.id === type.id
    ) as { fields: { id: string; key: string }[] } | undefined;
    const field = draftType?.fields.find((entry) => entry.key === fieldKeys[index]);
    if (!field) throw new Error(`missing draft field ${fieldKeys[index]}`);
    return field.id;
  });
  return {
    api,
    baseRevision,
    draftRevision,
    draftVersion: patch.body.draft.revision.draftVersion as number,
    affectedTypeIds: affectedTypes.map((type) => type.id),
    affectedFieldIds,
    steps: affectedFieldIds.map((fieldId, index) => ({
      kind: 'set_default',
      fieldId,
      values: [`value-${index}`],
    })),
    unrelatedTypeId: unrelatedType.id,
    unrelatedFieldId: unrelatedField.id,
  };
}

async function prepareContainmentMigration(
  seedContent: boolean
): Promise<PreparedContainmentMigration> {
  const api = apiForOwner();
  const current = await api.get('/type-catalogue');
  const baseRevision = current.body.revision.revision as number;
  const type = current.body.types.find((entry: { key: string }) => entry.key === 'storage_box') as
    | { id: string }
    | undefined;
  const childType = current.body.types.find((entry: { key: string }) => entry.key === 'cable') as
    | { id: string }
    | undefined;
  if (!type || !childType) throw new Error('missing containment test types');
  inventoryDb.raw
    .prepare(
      `INSERT INTO items
         (id, name, type_id, placement_kind, is_container, access, last_edited_time, seq)
       VALUES ('container', 'Container', ?, 'hand', 1, 'open', '2026-09-23T00:00:00.000Z', 1)`
    )
    .run(type.id);
  if (seedContent) {
    inventoryDb.raw
      .prepare(
        `INSERT INTO items
           (id, name, type_id, placement_kind, containing_item_id, last_edited_time, seq)
         VALUES ('content', 'Content', ?, 'container', 'container', '2026-09-23T00:00:00.000Z', 2)`
      )
      .run(childType.id);
  }
  const created = await api.post('/type-catalogue/drafts').send({ baseRevision });
  const draftRevision = created.body.revision.revision as number;
  const patch = await api.patch(`/type-catalogue/drafts/${draftRevision}`).send({
    baseRevision,
    expectedDraftVersion: created.body.revision.draftVersion,
    operations: [{ kind: 'put_type', id: type.id, capabilities: [] }],
  });
  return {
    api,
    baseRevision,
    draftRevision,
    draftVersion: patch.body.draft.revision.draftVersion as number,
    typeId: type.id,
  };
}

async function publish(
  prepared: PreparedMigration,
  overrides: {
    readonly affectedTypeIds?: readonly string[];
    readonly affectedFieldIds?: readonly string[];
    readonly steps?: PreparedMigration['steps'];
  } = {}
) {
  return prepared.api.post(`/type-catalogue/drafts/${prepared.draftRevision}/publish`).send({
    baseRevision: prepared.baseRevision,
    expectedDraftVersion: prepared.draftVersion,
    migration: {
      name: 'required-fields',
      fromRevision: prepared.baseRevision,
      toRevision: prepared.draftRevision,
      affectedTypeIds: overrides.affectedTypeIds ?? prepared.affectedTypeIds,
      affectedFieldIds: overrides.affectedFieldIds ?? prepared.affectedFieldIds,
      steps: overrides.steps ?? prepared.steps,
    },
  });
}

async function publishContainment(
  prepared: PreparedContainmentMigration,
  affectedTypeIds: readonly string[]
) {
  return prepared.api.post(`/type-catalogue/drafts/${prepared.draftRevision}/publish`).send({
    baseRevision: prepared.baseRevision,
    expectedDraftVersion: prepared.draftVersion,
    migration: {
      name: 'remove-containment',
      fromRevision: prepared.baseRevision,
      toRevision: prepared.draftRevision,
      affectedTypeIds,
      affectedFieldIds: [],
      steps: [],
    },
  });
}

async function expectPublicationRolledBack(prepared: PreparedMigration): Promise<void> {
  const current = await prepared.api.get('/type-catalogue');
  const draft = await prepared.api.get('/type-catalogue/drafts/current');
  expect(current.body.revision.revision).toBe(prepared.baseRevision);
  expect(draft.body.revision.revision).toBe(prepared.draftRevision);
  expect(inventoryDb.raw.prepare(`SELECT count(*) AS count FROM item_field_values`).get()).toEqual({
    count: 0,
  });
  expect(
    inventoryDb.raw
      .prepare(`SELECT count(*) AS count FROM catalogue_events WHERE revision = ?`)
      .get(prepared.draftRevision)
  ).toEqual({ count: 0 });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-catalogue-migration-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('catalogue publication migration coverage', () => {
  it('rejects an empty client-declared migration without publishing', async () => {
    const prepared = await prepareRequiredFieldMigration();
    const response = await publish(prepared, {
      affectedTypeIds: [],
      affectedFieldIds: [],
      steps: [],
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('migration_coverage_mismatch');
    expect(response.body.issues).not.toHaveLength(0);
    await expectPublicationRolledBack(prepared);
  });

  it('rejects omitted affected types and fields without migrating a subset', async () => {
    const prepared = await prepareRequiredFieldMigration();
    const response = await publish(prepared, {
      affectedTypeIds: prepared.affectedTypeIds.slice(0, 1),
      affectedFieldIds: prepared.affectedFieldIds.slice(0, 1),
      steps: prepared.steps.slice(0, 1),
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('migration_coverage_mismatch');
    await expectPublicationRolledBack(prepared);
  });

  it('rejects unrelated type and field declarations', async () => {
    const prepared = await prepareRequiredFieldMigration();
    const response = await publish(prepared, {
      affectedTypeIds: [...prepared.affectedTypeIds, prepared.unrelatedTypeId],
      affectedFieldIds: [...prepared.affectedFieldIds, prepared.unrelatedFieldId],
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('migration_coverage_mismatch');
    await expectPublicationRolledBack(prepared);
  });

  it('rejects incomplete steps for live affected item fields', async () => {
    const prepared = await prepareRequiredFieldMigration();
    const response = await publish(prepared, { steps: prepared.steps.slice(0, 1) });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('migration_steps_incomplete');
    expect(response.body.issues).not.toHaveLength(0);
    await expectPublicationRolledBack(prepared);
  });

  it('rejects a step that copies from a field owned by another type', async () => {
    const prepared = await prepareRequiredFieldMigration();
    const targetFieldId = prepared.affectedFieldIds[0];
    const remainingStep = prepared.steps[1];
    if (targetFieldId === undefined || remainingStep === undefined) {
      throw new Error('prepared migration is missing required coverage');
    }
    const response = await publish(prepared, {
      steps: [
        {
          kind: 'copy',
          fromFieldId: prepared.unrelatedFieldId,
          toFieldId: targetFieldId,
        },
        remainingStep,
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('migration_steps_incomplete');
    await expectPublicationRolledBack(prepared);
  });

  it('publishes and migrates every row when coverage is complete', async () => {
    const prepared = await prepareRequiredFieldMigration();
    const response = await publish(prepared);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.revision.revision).toBe(prepared.draftRevision);
    expect(
      inventoryDb.raw
        .prepare(
          `SELECT field_id AS fieldId, value_json AS valueJson
           FROM item_field_values ORDER BY field_id`
        )
        .all()
    ).toEqual(
      prepared.affectedFieldIds
        .map((fieldId, index) => ({ fieldId, valueJson: JSON.stringify(`value-${index}`) }))
        .toSorted((left, right) => left.fieldId.localeCompare(right.fieldId))
    );
    expect(
      inventoryDb.raw.prepare(`SELECT count(*) AS count FROM events WHERE kind = 'migrated'`).get()
    ).toEqual({ count: 2 });
  });

  it('allows an explicit no-op migration when the changed types have no live items', async () => {
    const prepared = await prepareRequiredFieldMigration(false);
    const response = await publish(prepared, { steps: [] });

    expect(response.status).toBe(200);
    expect(
      inventoryDb.raw.prepare(`SELECT count(*) AS count FROM item_field_values`).get()
    ).toEqual({ count: 0 });
    expect(
      inventoryDb.raw.prepare(`SELECT count(*) AS count FROM events WHERE kind = 'migrated'`).get()
    ).toEqual({ count: 0 });
  });

  it('rejects empty containment coverage without inspecting an author-selected subset', async () => {
    const prepared = await prepareContainmentMigration(true);
    const response = await publishContainment(prepared, []);

    expect(response.status).toBe(400);
    expect(response.body.code).toBe('migration_coverage_mismatch');
    const current = await prepared.api.get('/type-catalogue');
    expect(current.body.revision.revision).toBe(prepared.baseRevision);
    expect(
      inventoryDb.raw
        .prepare(`SELECT is_container AS isContainer FROM items WHERE id = 'container'`)
        .get()
    ).toEqual({
      isContainer: 1,
    });
    expect(
      inventoryDb.raw
        .prepare(`SELECT count(*) AS count FROM catalogue_events WHERE revision = ?`)
        .get(prepared.draftRevision)
    ).toEqual({ count: 0 });
  });

  it('rolls back capability materialization when containment is still in use', async () => {
    const prepared = await prepareContainmentMigration(true);
    const response = await publishContainment(prepared, [prepared.typeId]);

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('migration_containment_in_use');
    const current = await prepared.api.get('/type-catalogue');
    const type = current.body.types.find((entry: { id: string }) => entry.id === prepared.typeId);
    expect(current.body.revision.revision).toBe(prepared.baseRevision);
    expect(type.capabilities).toContain('containment');
    expect(
      inventoryDb.raw
        .prepare(`SELECT is_container AS isContainer, access FROM items WHERE id = 'container'`)
        .get()
    ).toEqual({ isContainer: 1, access: 'open' });
    expect(
      inventoryDb.raw.prepare(`SELECT count(*) AS count FROM events WHERE kind = 'migrated'`).get()
    ).toEqual({ count: 0 });
    expect(
      inventoryDb.raw
        .prepare(`SELECT count(*) AS count FROM catalogue_events WHERE revision = ?`)
        .get(prepared.draftRevision)
    ).toEqual({ count: 0 });
  });

  it('publishes and materializes a complete containment capability migration', async () => {
    const prepared = await prepareContainmentMigration(false);
    const response = await publishContainment(prepared, [prepared.typeId]);

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body.revision.revision).toBe(prepared.draftRevision);
    expect(
      inventoryDb.raw
        .prepare(`SELECT is_container AS isContainer, access FROM items WHERE id = 'container'`)
        .get()
    ).toEqual({ isContainer: 0, access: null });
    expect(
      inventoryDb.raw.prepare(`SELECT count(*) AS count FROM events WHERE kind = 'migrated'`).get()
    ).toEqual({ count: 1 });
  });
});
