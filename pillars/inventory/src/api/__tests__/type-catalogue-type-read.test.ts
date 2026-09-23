/**
 * `GET /type-catalogue/types/:typeId` reads one type as an exact published
 * catalogue revision defined it, and writes nothing.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  abandonCatalogueDraft,
  createCatalogueDraft,
  patchCatalogueDraft,
  publishCatalogueDraft,
} from '../../catalogue/authoring.js';
import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { ServiceAccountPrincipal } from '@pops/pillar-sdk/server';

import type { CatalogueDescriptor, DraftOperation } from '../../catalogue/authoring-types.js';
import type { InventoryIdentityResolver } from '../middleware/identity.js';

const transport = createTestTransport();
const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
const SERVICE_KEY = 'pops_sa_type_read.not-a-real-secret';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-type-read-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function servicePrincipal(scopes: readonly string[]): ServiceAccountPrincipal {
  return { id: 'sa_type_read', name: 'type-reader', scopes };
}

function identity(mode: 'web' | 'service' | 'none', scopes: readonly string[]) {
  const resolver: InventoryIdentityResolver = async (request) => {
    if (mode === 'service' && request.get('x-api-key') === SERVICE_KEY) {
      return { user: null, serviceAccount: servicePrincipal(scopes) };
    }
    if (mode === 'web') return { user: { email: 'owner@example.com' }, serviceAccount: null };
    return { user: null, serviceAccount: null };
  };
  return resolver;
}

function apiFor(mode: 'web' | 'service' | 'none', scopes: readonly string[] = []): BoundAgent {
  const app = createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    serviceAccountVerifier: (key) =>
      Promise.resolve(
        key === SERVICE_KEY
          ? { outcome: 'authenticated', principal: servicePrincipal(scopes) }
          : { outcome: 'rejected' }
      ),
    identityResolver: identity(mode, scopes),
    documents: {
      getPaperlessStatus: () =>
        Promise.resolve({ configured: false, available: false, baseUrl: null }),
      searchPaperlessDocuments: () => Promise.resolve([]),
    },
  });
  return transport.requestOn(app);
}

function publish(baseRevision: number, operations: DraftOperation[]): CatalogueDescriptor {
  const draft = createCatalogueDraft(inventoryDb.db, baseRevision, AUTHOR);
  const patched = patchCatalogueDraft(
    inventoryDb.db,
    {
      revision: draft.revision.revision,
      baseRevision,
      expectedDraftVersion: draft.revision.draftVersion,
    },
    operations
  ).draft;
  return publishCatalogueDraft(
    inventoryDb.db,
    draft.revision.revision,
    { baseRevision, expectedDraftVersion: patched.revision.draftVersion, note: null },
    AUTHOR
  );
}

interface History {
  readonly renamedId: string;
  readonly originalLabel: string;
  readonly addedId: string;
  readonly added: CatalogueDescriptor;
  readonly archived: CatalogueDescriptor;
}

/** Revision 1 as seeded; the next renames a seeded type and adds `gadget`; the one after archives `gadget`. */
function history(): History {
  const seeded = inventoryDb.raw
    .prepare(`SELECT id, label FROM item_types WHERE revision = 1 ORDER BY sort_order, id LIMIT 1`)
    .get() as { id: string; label: string };
  const added = publish(1, [
    { kind: 'put_type', id: seeded.id, label: 'Renamed type' },
    { kind: 'put_type', key: 'gadget', label: 'Gadget' },
  ]);
  const gadget = added.types.find((type) => type.key === 'gadget');
  if (gadget === undefined) throw new Error('gadget was not published');
  const archived = publish(added.revision.revision, [{ kind: 'archive_type', id: gadget.id }]);
  return {
    renamedId: seeded.id,
    originalLabel: seeded.label,
    addedId: gadget.id,
    added,
    archived,
  };
}

async function readType(api: BoundAgent, typeId: string, revision?: number) {
  const request = api.get(`/type-catalogue/types/${typeId}`);
  return revision === undefined ? request : request.query({ revision });
}

describe('reading one type at a catalogue revision', () => {
  it('reads the current published revision when none is named, with its ETag', async () => {
    const h = history();
    const api = apiFor('web');

    const response = await readType(api, h.addedId);

    expect(response.status).toBe(200);
    expect(response.body.revision).toMatchObject({
      revision: h.archived.revision.revision,
      status: 'published',
    });
    expect(response.body.type).toMatchObject({ id: h.addedId, key: 'gadget', label: 'Gadget' });
    expect(response.body.type.archivedAt).not.toBeNull();
    expect(response.headers.etag).toBe(`"catalogue-${h.archived.revision.revision}"`);

    const cached = await api
      .get(`/type-catalogue/types/${h.addedId}`)
      .set('If-None-Match', `"catalogue-${h.archived.revision.revision}"`);
    expect(cached.status).toBe(304);
  });

  it('returns exactly the definition each revision published, across a rename and an archive', async () => {
    const h = history();
    const api = apiFor('web');

    const beforeRename = await readType(api, h.renamedId, 1);
    const afterRename = await readType(api, h.renamedId, h.added.revision.revision);
    const beforeArchive = await readType(api, h.addedId, h.added.revision.revision);
    const afterArchive = await readType(api, h.addedId, h.archived.revision.revision);

    expect(beforeRename.body.type).toMatchObject({ id: h.renamedId, label: h.originalLabel });
    expect(beforeRename.body.revision.revision).toBe(1);
    expect(afterRename.body.type).toMatchObject({ id: h.renamedId, label: 'Renamed type' });
    expect(afterRename.body.type.key).toBe(beforeRename.body.type.key);
    expect(beforeArchive.body.type.archivedAt).toBeNull();
    expect(afterArchive.body.type.archivedAt).toEqual(expect.any(String));
    expect(afterArchive.body.type.revision).toBe(h.archived.revision.revision);
  });

  it('answers 404 catalogue_type_unknown for a type the revision does not define', async () => {
    const h = history();
    const api = apiFor('web');

    const beforeAdded = await readType(api, h.addedId, 1);
    const unknown = await readType(api, randomUUID());

    expect(beforeAdded.status).toBe(404);
    expect(beforeAdded.body.code).toBe('catalogue_type_unknown');
    expect(unknown.status).toBe(404);
    expect(unknown.body.code).toBe('catalogue_type_unknown');
  });

  it('answers 404 catalogue_revision_unknown for a missing, draft or abandoned revision', async () => {
    const h = history();
    const api = apiFor('web');
    const base = h.archived.revision.revision;
    const abandoned = createCatalogueDraft(inventoryDb.db, base, AUTHOR);
    abandonCatalogueDraft(
      inventoryDb.db,
      {
        revision: abandoned.revision.revision,
        baseRevision: base,
        expectedDraftVersion: abandoned.revision.draftVersion,
      },
      AUTHOR
    );
    const draft = createCatalogueDraft(inventoryDb.db, base, AUTHOR);

    for (const revision of [999, abandoned.revision.revision, draft.revision.revision]) {
      const response = await readType(api, h.renamedId, revision);
      expect(response.status).toBe(404);
      expect(response.body.code).toBe('catalogue_revision_unknown');
    }
  });

  it('rejects a type id that is not a UUID', async () => {
    const response = await readType(apiFor('web'), 'not-a-uuid');

    expect(response.status).toBe(400);
  });

  it('writes nothing', async () => {
    const h = history();
    const counts = () =>
      ['catalogue_revisions', 'catalogue_events', 'item_types'].map(
        (table) => inventoryDb.raw.prepare(`SELECT count(*) AS count FROM ${table}`).get() as object
      );
    const before = counts();

    await readType(apiFor('web'), h.addedId, h.added.revision.revision);
    await readType(apiFor('web'), randomUUID());

    expect(counts()).toEqual(before);
  });

  it('requires an owner session or the inventory.types.read grant', async () => {
    const h = history();

    const anonymous = await readType(apiFor('none'), h.addedId);
    const granted = await apiFor('service', ['inventory.types.read'])
      .get(`/type-catalogue/types/${h.addedId}`)
      .set('x-api-key', SERVICE_KEY);
    const ungranted = await apiFor('service', ['inventory.sync'])
      .get(`/type-catalogue/types/${h.addedId}`)
      .set('x-api-key', SERVICE_KEY);

    expect(anonymous.status).toBe(401);
    expect(anonymous.body.code).toBe('catalogue_unauthorised');
    expect(granted.status).toBe(200);
    expect(ungranted.status).toBe(403);
  });
});
