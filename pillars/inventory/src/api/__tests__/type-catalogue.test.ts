import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type {
  ServiceAccountPrincipal,
  ServiceAccountVerification,
  ServiceAccountVerifier,
} from '@pops/pillar-sdk/server';

import type { InventoryIdentityResolver } from '../middleware/identity.js';

const transport = createTestTransport();
const OWNER_EMAIL = 'owner@example.com';
const SERVICE_KEY = 'pops_sa_catalogue.not-a-real-secret';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

function servicePrincipal(scopes: readonly string[]): ServiceAccountPrincipal {
  return { id: 'sa_catalogue', name: 'catalogue-editor', scopes };
}

function verifier(scopes: readonly string[]): ServiceAccountVerifier {
  const verification: ServiceAccountVerification = {
    outcome: 'authenticated',
    principal: servicePrincipal(scopes),
  };
  return (key) => Promise.resolve(key === SERVICE_KEY ? verification : { outcome: 'rejected' });
}

function identity(
  mode: 'web' | 'service' | 'none',
  scopes: readonly string[] = []
): InventoryIdentityResolver {
  return async (request) => {
    if (mode === 'service' && request.get('x-api-key') === SERVICE_KEY) {
      return { user: null, serviceAccount: servicePrincipal(scopes) };
    }
    if (mode === 'web') return { user: { email: OWNER_EMAIL }, serviceAccount: null };
    return { user: null, serviceAccount: null };
  };
}

function apiFor(mode: 'web' | 'service' | 'none', scopes: readonly string[] = []): BoundAgent {
  const app = createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    serviceAccountVerifier: verifier(scopes),
    identityResolver: identity(mode, scopes),
    documents: {
      getPaperlessStatus: () =>
        Promise.resolve({ configured: false, available: false, baseUrl: null }),
      searchPaperlessDocuments: () => Promise.resolve([]),
    },
  });
  return transport.requestOn(app);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-type-catalogue-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('type catalogue owner API', () => {
  it('reads the current immutable revision and honours its ETag', async () => {
    const api = apiFor('web');
    const first = await api.get('/type-catalogue');

    expect(first.status).toBe(200);
    expect(first.body.revision.status).toBe('published');
    const etag = first.headers.etag;
    if (etag === undefined) throw new Error('catalogue response did not include an ETag');
    expect(etag).toBe(`"catalogue-${first.body.revision.revision}"`);

    const cached = await api.get('/type-catalogue').set('If-None-Match', etag);

    expect(cached.status).toBe(304);
  });

  it('requires an owner identity for catalogue reads and authoring', async () => {
    const api = apiFor('none');

    const read = await api.get('/type-catalogue');
    const create = await api.post('/type-catalogue/drafts').send({ baseRevision: 1 });

    expect(read.status).toBe(401);
    expect(create.status).toBe(401);
    expect(read.body.code).toBe('catalogue_unauthorised');
  });

  it('allows a read-scoped service account to read but not author', async () => {
    const owner = apiFor('web');
    const current = await owner.get('/type-catalogue');
    await owner
      .post('/type-catalogue/drafts')
      .send({ baseRevision: current.body.revision.revision });
    const api = apiFor('service', ['inventory.types.read']);
    const read = await api.get('/type-catalogue').set('x-api-key', SERVICE_KEY);
    const readDraft = await api.get('/type-catalogue/drafts/current').set('x-api-key', SERVICE_KEY);
    const create = await api
      .post('/type-catalogue/drafts')
      .set('x-api-key', SERVICE_KEY)
      .send({ baseRevision: read.body.revision.revision });

    expect(read.status).toBe(200);
    expect(readDraft.status).toBe(403);
    expect(create.status).toBe(403);
  });

  it('validates an item payload through the read scope without mutating persisted state', async () => {
    const api = apiFor('service', ['inventory.types.read']);
    const catalogue = await api.get('/type-catalogue').set('x-api-key', SERVICE_KEY);
    const type = catalogue.body.types[0];
    const before = {
      revisions: inventoryDb.raw.prepare('SELECT count(*) AS count FROM catalogue_revisions').get(),
      items: inventoryDb.raw.prepare('SELECT count(*) AS count FROM items').get(),
      values: inventoryDb.raw.prepare('SELECT count(*) AS count FROM item_field_values').get(),
    };

    const response = await api
      .post('/type-catalogue/items/validate')
      .set('x-api-key', SERVICE_KEY)
      .send({
        catalogueRevision: catalogue.body.revision.revision,
        typeId: type.id,
        fieldValues: [],
      });
    const after = {
      revisions: inventoryDb.raw.prepare('SELECT count(*) AS count FROM catalogue_revisions').get(),
      items: inventoryDb.raw.prepare('SELECT count(*) AS count FROM items').get(),
      values: inventoryDb.raw.prepare('SELECT count(*) AS count FROM item_field_values').get(),
    };

    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(response.body).toEqual({
      valid: true,
      catalogueRevision: catalogue.body.revision.revision,
      typeId: type.id,
      fieldValues: [],
    });
    expect(after).toEqual(before);
  });

  it('returns structured item validation failures without disclosing internal rows', async () => {
    const api = apiFor('web');
    const catalogue = await api.get('/type-catalogue');
    const type = catalogue.body.types[0];

    const response = await api.post('/type-catalogue/items/validate').send({
      catalogueRevision: catalogue.body.revision.revision,
      typeId: type.id,
      fieldValues: [
        {
          fieldId: '00000000-0000-4000-8000-000000000001',
          source: 'stored',
          values: ['unexpected'],
        },
      ],
    });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      message: 'field 00000000-0000-4000-8000-000000000001: is not declared',
      code: 'item_validation_failed',
      issues: [
        {
          definitionId: '00000000-0000-4000-8000-000000000001',
          path: 'fieldValues.00000000-0000-4000-8000-000000000001',
          code: 'field_unknown',
          message: 'field 00000000-0000-4000-8000-000000000001: is not declared',
        },
      ],
    });
  });

  it('creates, edits, publishes, and audits a draft for the owner', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const type = current.body.types[0];
    inventoryDb.raw
      .prepare(
        `INSERT INTO items (id, name, type_id, placement_kind, last_edited_time, seq)
         VALUES ('catalogue-item', 'Catalogue item', ?, 'hand', '2026-09-23T00:00:00.000Z', 1)`
      )
      .run(type.id);

    const draftResponse = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const draftRevision = draftResponse.body.revision.revision;

    expect(draftResponse.status).toBe(201);
    expect(draftResponse.body.revision).toMatchObject({ status: 'draft', draftVersion: 1 });

    const resumedDraft = await api.get('/type-catalogue/drafts/current');

    expect(resumedDraft.status).toBe(200);
    expect(resumedDraft.body.revision.revision).toBe(draftRevision);

    const patch = await api.patch(`/type-catalogue/drafts/${draftRevision}`).send({
      baseRevision,
      expectedDraftVersion: draftResponse.body.revision.draftVersion,
      operations: [
        { kind: 'put_type', id: type.id, label: 'Updated label' },
        {
          kind: 'put_field',
          typeId: type.id,
          key: 'catalogue_test_field',
          label: 'Catalogue test field',
          fieldKind: 'short_text',
          cardinality: 'one',
          storage: 'stored',
        },
      ],
    });

    expect(patch.status).toBe(200);
    expect(patch.body.draft.revision.draftVersion).toBe(2);
    expect(patch.body.draft.types.find((entry: { id: string }) => entry.id === type.id).label).toBe(
      'Updated label'
    );
    expect(patch.body.compatibility.classification).toBe('compatible');
    expect(patch.body.compatibility.affectedItems).toBe(1);

    const published = await api.post(`/type-catalogue/drafts/${draftRevision}/publish`).send({
      baseRevision,
      expectedDraftVersion: patch.body.draft.revision.draftVersion,
      note: 'Owner update',
    });

    expect(published.status).toBe(200);
    expect(published.body.revision.status).toBe('published');
    expect(published.body.revision.published.note).toBe('Owner update');

    const audit = await api.get('/type-catalogue/audit').query({ limit: 10 });

    expect(audit.status).toBe(200);
    expect(audit.body.events[0]).toMatchObject({
      revision: draftRevision,
      kind: 'published',
      actor: { kind: 'web', id: OWNER_EMAIL },
    });
  });

  it('authors a type, creates its item, and edits stable values entirely through APIs', async () => {
    const api = apiFor('web');
    const itemId = '30000000-0000-4000-8000-000000000001';
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const createdDraft = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const draftRevision = createdDraft.body.revision.revision;

    const typePatch = await api.patch(`/type-catalogue/drafts/${draftRevision}`).send({
      baseRevision,
      expectedDraftVersion: createdDraft.body.revision.draftVersion,
      operations: [{ kind: 'put_type', key: 'api_tool', label: 'API tool' }],
    });
    expect(typePatch.status, JSON.stringify(typePatch.body)).toBe(200);
    const type = typePatch.body.draft.types.find(
      (entry: { key: string }) => entry.key === 'api_tool'
    );
    if (type === undefined) throw new Error('authored type missing from draft');
    const typeId = type.id;
    const fieldPatch = await api.patch(`/type-catalogue/drafts/${draftRevision}`).send({
      baseRevision,
      expectedDraftVersion: typePatch.body.draft.revision.draftVersion,
      operations: [
        {
          kind: 'put_field',
          typeId,
          key: 'serial',
          label: 'Serial',
          fieldKind: 'short_text',
          cardinality: 'one',
          storage: 'stored',
        },
      ],
    });
    expect(fieldPatch.status, JSON.stringify(fieldPatch.body)).toBe(200);
    const field = fieldPatch.body.draft.types
      .find((entry: { id: string }) => entry.id === typeId)
      ?.fields.find((entry: { key: string }) => entry.key === 'serial');
    if (field === undefined) throw new Error('authored field missing from draft');
    const fieldId = field.id;
    const published = await api
      .post(`/type-catalogue/drafts/${draftRevision}/publish`)
      .send({ baseRevision, expectedDraftVersion: fieldPatch.body.draft.revision.draftVersion });
    expect(published.status, JSON.stringify(published.body)).toBe(200);

    const create = await api
      .post('/sync/mutations')
      .set('Pops-Inventory-Protocol', '2')
      .send({
        mutations: [
          {
            mutationId: '40000000-0000-4000-8000-000000000001',
            op: 'item.create',
            entityId: itemId,
            baseRevision: null,
            catalogueRevision: draftRevision,
            dependsOn: [],
            clientTime: '2026-09-23T00:00:00.000Z',
            args: {
              item: {
                name: 'API-authored item',
                typeId,
                values: [{ fieldId, values: ['first'] }],
              },
            },
          },
        ],
      });
    expect(create.status, JSON.stringify(create.body)).toBe(200);
    expect(create.body.outcomes[0]).toMatchObject({ status: 'applied', revision: 1 });

    const edit = await api
      .post('/sync/mutations')
      .set('Pops-Inventory-Protocol', '2')
      .send({
        mutations: [
          {
            mutationId: '40000000-0000-4000-8000-000000000002',
            op: 'item.edit',
            entityId: itemId,
            baseRevision: 1,
            catalogueRevision: draftRevision,
            dependsOn: [],
            clientTime: '2026-09-23T00:01:00.000Z',
            args: { name: 'Edited API item', values: [{ fieldId, values: ['second'] }] },
          },
        ],
      });
    expect(edit.status, JSON.stringify(edit.body)).toBe(200);
    expect(edit.body.outcomes[0]).toMatchObject({ status: 'applied', revision: 2 });

    const snapshot = await api.get('/sync/snapshot').set('Pops-Inventory-Protocol', '2');
    expect(snapshot.status, JSON.stringify(snapshot.body)).toBe(200);
    expect(snapshot.body.items).toContainEqual(
      expect.objectContaining({
        id: itemId,
        revision: 2,
        name: 'Edited API item',
        typeId,
        catalogueRevision: draftRevision,
        fieldValues: [
          {
            fieldId,
            source: 'stored',
            catalogueRevision: draftRevision,
            values: ['second'],
          },
        ],
      })
    );
  });

  it('activates a supported protocol before publishing its catalogue vocabulary', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision as number;
    const typeId = current.body.types[0].id as string;
    const initialRollout = await api.get('/type-catalogue/protocol-rollout');
    const draft = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const draftRevision = draft.body.revision.revision as number;

    expect(initialRollout.body).toEqual({
      minimumProtocol: 1,
      supportedProtocol: 2,
      catalogueMinimumProtocol: 1,
    });

    const premature = await api
      .post(`/type-catalogue/drafts/${draftRevision}/publish`)
      .send({ baseRevision, minimumProtocol: 2, note: 'Protocol 2 vocabulary' });
    const draftAfterRefusal = await api.get('/type-catalogue/drafts/current');

    expect(premature.status).toBe(409);
    expect(premature.body).toMatchObject({
      code: 'protocol_rollout_required',
      message: expect.stringContaining('Activate inventory protocol 2'),
    });
    expect(draftAfterRefusal.body.revision.minimumProtocol).toBe(1);

    const unsupported = await api.post('/type-catalogue/protocol-rollout').send({
      expectedMinimumProtocol: 1,
      minimumProtocol: 3,
    });
    expect(unsupported.status).toBe(400);
    expect(unsupported.body.code).toBe('protocol_not_supported');

    const activated = await api.post('/type-catalogue/protocol-rollout').send({
      expectedMinimumProtocol: 1,
      minimumProtocol: 2,
    });
    expect(activated.body).toMatchObject({ minimumProtocol: 2, catalogueMinimumProtocol: 1 });

    const staleActivation = await api.post('/type-catalogue/protocol-rollout').send({
      expectedMinimumProtocol: 1,
      minimumProtocol: 2,
    });
    const downgrade = await api.post('/type-catalogue/protocol-rollout').send({
      expectedMinimumProtocol: 2,
      minimumProtocol: 1,
    });
    expect(staleActivation.status).toBe(409);
    expect(staleActivation.body.code).toBe('protocol_rollout_conflict');
    expect(downgrade.status).toBe(409);
    expect(downgrade.body.code).toBe('protocol_minimum_downgrade');

    inventoryDb.raw.close();
    inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
    const restarted = apiFor('web');
    const persistedRollout = await restarted.get('/type-catalogue/protocol-rollout');
    expect(persistedRollout.body.minimumProtocol).toBe(2);

    const protocol1 = await restarted.get('/types').set({ 'Pops-Inventory-Protocol': '1' });
    const protocol2 = await restarted.get('/types').set({ 'Pops-Inventory-Protocol': '2' });
    expect(protocol1.status).toBe(426);
    expect(protocol1.body.code).toBe('client_too_old');
    expect(protocol2.status).toBe(200);

    const published = await restarted
      .post(`/type-catalogue/drafts/${draftRevision}/publish`)
      .send({ baseRevision, minimumProtocol: 2, note: 'Protocol 2 vocabulary' });
    expect(published.status).toBe(200);

    const snapshot = await restarted.get('/sync/snapshot').set({ 'Pops-Inventory-Protocol': '2' });
    expect(snapshot.body.minimumProtocol).toBe(2);

    const mutationId = randomUUID();
    const entityId = randomUUID();
    const write = await restarted
      .post('/sync/mutations')
      .set({ 'Pops-Inventory-Protocol': '2' })
      .send({
        mutations: [
          {
            mutationId,
            op: 'item.create',
            entityId,
            baseRevision: null,
            catalogueRevision: draftRevision,
            dependsOn: [],
            clientTime: '2026-09-23T00:00:00.000Z',
            args: {
              item: {
                name: 'Protocol 2 item',
                typeId,
                values: [],
                placement: { kind: 'hand' },
              },
            },
          },
        ],
      });
    expect(write.status, JSON.stringify(write.body)).toBe(200);
    expect(write.body.outcomes).toEqual([
      expect.objectContaining({ mutationId, status: 'applied' }),
    ]);

    const changes = await restarted
      .get('/sync/changes')
      .set({ 'Pops-Inventory-Protocol': '2' })
      .query({ since: 0, epoch: snapshot.body.epoch });
    expect(changes.status).toBe(200);
    expect(changes.body.minimumProtocol).toBe(2);

    const finalRollout = await restarted.get('/type-catalogue/protocol-rollout');
    expect(finalRollout.body).toEqual({
      minimumProtocol: 2,
      supportedProtocol: 2,
      catalogueMinimumProtocol: 2,
    });
  });

  it('reports when there is no draft to resume', async () => {
    const response = await apiFor('web').get('/type-catalogue/drafts/current');

    expect(response.status).toBe(404);
    expect(response.body.code).toBe('catalogue_draft_missing');
  });

  it('previews fresh compatibility without persisting proposed operations', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const type = current.body.types[0];
    inventoryDb.raw
      .prepare(
        `INSERT INTO items (id, name, type_id, placement_kind, last_edited_time, seq)
         VALUES ('preview-item', 'Preview item', ?, 'hand', '2026-09-23T00:00:00.000Z', 1)`
      )
      .run(type.id);
    const created = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const revision = created.body.revision.revision;

    const preview = await api.post(`/type-catalogue/drafts/${revision}/preview`).send({
      baseRevision,
      expectedDraftVersion: created.body.revision.draftVersion,
      operations: [
        {
          kind: 'put_field',
          typeId: type.id,
          key: 'preview_only',
          label: 'Preview only',
          fieldKind: 'short_text',
          cardinality: 'one',
          storage: 'stored',
        },
      ],
    });
    const persisted = await api.get('/type-catalogue/drafts/current');

    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({ baseRevision, draftRevision: revision });
    expect(persisted.body.revision.draftVersion).toBe(created.body.revision.draftVersion);
    expect(preview.body.compatibility).toMatchObject({
      classification: 'compatible',
      affectedItems: 1,
    });
    expect(
      persisted.body.types
        .flatMap((entry: { fields: { key: string }[] }) => entry.fields)
        .some((field: { key: string }) => field.key === 'preview_only')
    ).toBe(false);
  });

  it('returns every preview validation issue and rolls back the invalid candidate', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const type = current.body.types[0];
    const created = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const revision = created.body.revision.revision;

    const preview = await api.post(`/type-catalogue/drafts/${revision}/preview`).send({
      baseRevision,
      expectedDraftVersion: created.body.revision.draftVersion,
      operations: [
        {
          kind: 'put_field',
          typeId: type.id,
          key: 'invalid_preview',
          label: 'Invalid preview',
          fieldKind: 'short_text',
          cardinality: 'many',
          storage: 'stored',
          fixedUnit: 'V',
          referenceKinds: ['item'],
          referenceTypeIds: ['00000000-0000-4000-8000-000000000001'],
        },
      ],
    });
    const persisted = await api.get('/type-catalogue/drafts/current');

    expect(preview.status, JSON.stringify(preview.body)).toBe(400);
    expect(preview.body.code).toBe('catalogue_validation_failed');
    expect(preview.body.preview).toMatchObject({
      baseRevision,
      draftRevision: revision,
      compatibility: { affectedItems: 0 },
    });
    expect(preview.body.issues.map((issue: { code: string }) => issue.code)).toEqual([
      'unit_forbidden',
      'reference_forbidden',
      'type_unknown',
    ]);
    expect(
      persisted.body.types
        .flatMap((entry: { fields: { key: string }[] }) => entry.fields)
        .some((field: { key: string }) => field.key === 'invalid_preview')
    ).toBe(false);
  });

  it('serializes migration-required and forbidden preview diagnostics', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const fields = current.body.types.flatMap(
      (type: { id: string; fields: { id: string; kind: string; required: boolean }[] }) =>
        type.fields.map((field) => ({ ...field, typeId: type.id }))
    );
    const optionalField = fields.find((field: { required: boolean }) => !field.required);
    const textField = fields.find((field: { kind: string }) => field.kind === 'short_text');
    expect(optionalField).toBeDefined();
    expect(textField).toBeDefined();
    if (optionalField === undefined || textField === undefined) return;
    const created = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const revision = created.body.revision.revision;

    const migrationRequired = await api.post(`/type-catalogue/drafts/${revision}/preview`).send({
      baseRevision,
      expectedDraftVersion: created.body.revision.draftVersion,
      operations: [
        {
          kind: 'put_field',
          id: optionalField.id,
          typeId: optionalField.typeId,
          required: true,
        },
      ],
    });
    const forbidden = await api.post(`/type-catalogue/drafts/${revision}/preview`).send({
      baseRevision,
      expectedDraftVersion: created.body.revision.draftVersion,
      operations: [
        {
          kind: 'put_field',
          id: textField.id,
          typeId: textField.typeId,
          fieldKind: 'long_text',
        },
      ],
    });

    expect(migrationRequired.status, JSON.stringify(migrationRequired.body)).toBe(200);
    expect(migrationRequired.body.compatibility).toMatchObject({
      classification: 'migration_required',
      changes: [{ code: 'field_became_required' }],
    });
    expect(forbidden.status, JSON.stringify(forbidden.body)).toBe(400);
    expect(forbidden.body.preview.compatibility).toMatchObject({
      classification: 'forbidden',
      changes: [{ code: 'immutable_shape' }],
    });
  });

  it('creates, edits, rejects a stale edit, and archives a type atomically', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const createdDraft = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const revision = createdDraft.body.revision.revision;
    const created = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision,
      expectedDraftVersion: createdDraft.body.revision.draftVersion,
      operations: [{ kind: 'put_type', key: 'test_equipment', label: 'Test equipment' }],
    });
    const type = created.body.draft.types.find(
      (entry: { key: string }) => entry.key === 'test_equipment'
    );

    const stale = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision: baseRevision + 1,
      expectedDraftVersion: created.body.draft.revision.draftVersion,
      operations: [{ kind: 'put_type', id: type.id, label: 'Stale label' }],
    });
    const edited = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision,
      expectedDraftVersion: created.body.draft.revision.draftVersion,
      operations: [{ kind: 'put_type', id: type.id, label: 'Edited equipment' }],
    });
    const archived = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision,
      expectedDraftVersion: edited.body.draft.revision.draftVersion,
      operations: [{ kind: 'archive_type', id: type.id }],
    });

    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('catalogue_conflict');
    expect(
      edited.body.draft.types.find((entry: { id: string }) => entry.id === type.id).label
    ).toBe('Edited equipment');
    expect(
      archived.body.draft.types.find((entry: { id: string }) => entry.id === type.id)
    ).toMatchObject({ label: 'Edited equipment', archivedAt: expect.any(String) });
  });

  it('rejects a draft based on a stale published revision', async () => {
    const api = apiFor('web');
    const response = await api.post('/type-catalogue/drafts').send({ baseRevision: 999_999 });

    expect(response.status).toBe(409);
    expect(response.body.code).toBe('catalogue_conflict');
  });

  it('abandons a draft without deleting its audit record', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const draft = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const revision = draft.body.revision.revision;

    const abandoned = await api
      .post(`/type-catalogue/drafts/${revision}/abandon`)
      .send({ baseRevision, expectedDraftVersion: draft.body.revision.draftVersion });
    const audit = await api.get('/type-catalogue/audit').query({ limit: 10 });

    expect(abandoned.status).toBe(200);
    expect(abandoned.body.revision.status).toBe('abandoned');
    expect(audit.body.events[0]).toMatchObject({ revision, kind: 'abandoned' });
  });
});
