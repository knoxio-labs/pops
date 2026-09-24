/**
 * POPS-4356: the catalogue authoring API has no delete operation by
 * construction. `PATCH /type-catalogue/drafts/:revision` validates its body
 * against `CatalogueDraftOperationSchema`, a closed discriminated union of
 * `put_*`, `archive_*` and `reorder` kinds -- any other `kind`, including one
 * shaped like a delete or remove, fails request validation before it ever
 * reaches the authoring service.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { InventoryIdentityResolver } from '../middleware/identity.js';

const transport = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-no-delete-op-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function apiFor(): BoundAgent {
  const identityResolver: InventoryIdentityResolver = async () => ({
    user: { email: 'owner@example.com' },
    serviceAccount: null,
  });
  const app = createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    serviceAccountVerifier: () => Promise.resolve({ outcome: 'rejected' }),
    identityResolver,
    documents: {
      getPaperlessStatus: () =>
        Promise.resolve({ configured: false, available: false, baseUrl: null }),
      searchPaperlessDocuments: () => Promise.resolve([]),
    },
  });
  return transport.requestOn(app);
}

describe('PATCH /type-catalogue/drafts/:revision has no delete operation', () => {
  it.each(['delete_field', 'delete_type', 'delete_enum_option', 'remove_field'])(
    'rejects a %s operation kind with 400 and mutates nothing',
    async (kind) => {
      const api = apiFor();
      const current = await api.get('/type-catalogue');
      const baseRevision = current.body.revision.revision as number;
      const typeId = current.body.types[0].id as string;
      const createdDraft = await api.post('/type-catalogue/drafts').send({ baseRevision });
      const revision = createdDraft.body.revision.revision;

      const response = await api.patch(`/type-catalogue/drafts/${revision}`).send({
        baseRevision,
        expectedDraftVersion: createdDraft.body.revision.draftVersion,
        operations: [{ kind, id: typeId }],
      });

      expect(response.status, JSON.stringify(response.body)).toBe(400);

      const draftAfter = await api.get('/type-catalogue/drafts/current');
      expect(draftAfter.body.revision.draftVersion).toBe(createdDraft.body.revision.draftVersion);
    }
  );

  it('rejects a batch mixing a valid operation with a delete-shaped one, applying neither', async () => {
    const api = apiFor();
    const current = await api.get('/type-catalogue');
    const baseRevision = current.body.revision.revision as number;
    const createdDraft = await api.post('/type-catalogue/drafts').send({ baseRevision });
    const revision = createdDraft.body.revision.revision;

    const response = await api.patch(`/type-catalogue/drafts/${revision}`).send({
      baseRevision,
      expectedDraftVersion: createdDraft.body.revision.draftVersion,
      operations: [
        { kind: 'put_type', key: 'never_created', label: 'Never created' },
        { kind: 'delete_type', id: current.body.types[0].id },
      ],
    });

    expect(response.status, JSON.stringify(response.body)).toBe(400);

    const draftAfter = await api.get('/type-catalogue/drafts/current');
    expect(
      draftAfter.body.types.some((entry: { key: string }) => entry.key === 'never_created')
    ).toBe(false);
  });
});
