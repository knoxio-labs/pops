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
    expect(draftResponse.body.revision.status).toBe('draft');

    const resumedDraft = await api.get('/type-catalogue/drafts/current');

    expect(resumedDraft.status).toBe(200);
    expect(resumedDraft.body.revision.revision).toBe(draftRevision);

    const patch = await api.patch(`/type-catalogue/drafts/${draftRevision}`).send({
      baseRevision,
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
    expect(patch.body.draft.types.find((entry: { id: string }) => entry.id === type.id).label).toBe(
      'Updated label'
    );
    expect(patch.body.compatibility.classification).toBe('compatible');
    expect(patch.body.compatibility.affectedItems).toBe(1);

    const published = await api
      .post(`/type-catalogue/drafts/${draftRevision}/publish`)
      .send({ baseRevision, note: 'Owner update' });

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
      operations: [{ kind: 'put_type', key: 'test_equipment', label: 'Test equipment' }],
    });
    const type = created.body.draft.types.find(
      (entry: { key: string }) => entry.key === 'test_equipment'
    );

    const stale = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision: baseRevision + 1,
      operations: [{ kind: 'put_type', id: type.id, label: 'Stale label' }],
    });
    const edited = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision,
      operations: [{ kind: 'put_type', id: type.id, label: 'Edited equipment' }],
    });
    const archived = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision,
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
      .send({ baseRevision });
    const audit = await api.get('/type-catalogue/audit').query({ limit: 10 });

    expect(abandoned.status).toBe(200);
    expect(abandoned.body.revision.status).toBe('abandoned');
    expect(audit.body.events[0]).toMatchObject({ revision, kind: 'abandoned' });
  });
});
