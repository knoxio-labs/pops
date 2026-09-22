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
    const api = apiFor('service', ['inventory.types.read']);
    const read = await api.get('/type-catalogue').set('x-api-key', SERVICE_KEY);
    const create = await api
      .post('/type-catalogue/drafts')
      .set('x-api-key', SERVICE_KEY)
      .send({ baseRevision: read.body.revision.revision });

    expect(read.status).toBe(200);
    expect(create.status).toBe(403);
  });

  it('creates, edits, publishes, and audits a draft for the owner', async () => {
    const api = apiFor('web');
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision;
    const type = current.body.types[0];

    const draftResponse = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const draftRevision = draftResponse.body.revision.revision;

    expect(draftResponse.status).toBe(201);
    expect(draftResponse.body.revision.status).toBe('draft');

    const patch = await api.patch(`/type-catalogue/drafts/${draftRevision}`).send({
      baseRevision,
      operations: [{ kind: 'put_type', id: type.id, label: 'Updated label' }],
    });

    expect(patch.status).toBe(200);
    expect(patch.body.draft.types.find((entry: { id: string }) => entry.id === type.id).label).toBe(
      'Updated label'
    );
    expect(patch.body.compatibility.classification).toBe('compatible');

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
