/**
 * POPS-4397: `POST /codes/suggest` (`suggestCodes` in `api/sync/codes.ts`)
 * must read the active persisted catalogue, not one fixed at server boot.
 * `sync-catalogue-codes.test.ts` only exercises the boot-time built-in
 * types; this file publishes catalogue changes at runtime and checks that
 * suggestion immediately follows them.
 */
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadPublishedCatalogue } from '../../catalogue/index.js';
import { items, openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { PROTOCOL_2, send, wireMutation, type WireMutation } from './sync-harness.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const transport = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;
let api: BoundAgent;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-codes-runtime-type-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  const rejectServiceAccount: ServiceAccountVerifier = () =>
    Promise.resolve({ outcome: 'rejected' });
  api = transport.requestOn(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3007',
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

interface Draft {
  readonly revision: number;
  readonly baseRevision: number;
  readonly draftVersion: number;
}

interface DraftTypeBody {
  readonly types: { id: string; key: string }[];
}

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

async function patch(
  draft: Draft,
  operations: readonly unknown[]
): Promise<{ draft: Draft; body: DraftTypeBody }> {
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

async function publish(draft: Draft): Promise<number> {
  const response = await api.post(`/type-catalogue/drafts/${draft.revision}/publish`).send({
    baseRevision: draft.baseRevision,
    expectedDraftVersion: draft.draftVersion,
  });
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.revision.revision as number;
}

function typeIdOf(body: DraftTypeBody, key: string): string {
  const type = body.types.find((entry) => entry.key === key);
  if (type === undefined) throw new Error(`type ${key} is missing`);
  return type.id;
}

async function suggest(body: Record<string, string>): Promise<string[]> {
  const response = await api.post('/codes/suggest').set(PROTOCOL_2).send(body);
  expect(response.status, JSON.stringify(response.body)).toBe(200);
  return response.body.suggestions as string[];
}

function createTypedItem(typeId: string, catalogueRevision: number, name: string): WireMutation {
  return wireMutation(
    'item.create',
    randomUUID(),
    { item: { name, typeId, values: [], placement: { kind: 'hand' } } },
    { catalogueRevision }
  );
}

async function applyAndCode(mutation: WireMutation, code: string): Promise<void> {
  const response = await send(api, [mutation], PROTOCOL_2);
  expect(response.body.outcomes[0], JSON.stringify(response.body)).toMatchObject({
    status: 'applied',
  });
  inventoryDb.db.update(items).set({ code }).where(eq(items.id, mutation.entityId)).run();
}

describe('POST /codes/suggest against the active catalogue', () => {
  it('suggests from a user-defined type published at runtime, not the boot-time catalogue', async () => {
    await activateProtocol2();
    const bootCatalogue = loadPublishedCatalogue(inventoryDb.db);
    if (!bootCatalogue) throw new Error('no boot-time catalogue');
    expect(bootCatalogue.types.some((type) => type.key === 'gizmo')).toBe(false);

    const draft = await createDraft(bootCatalogue.revision.revision);
    const withType = await patch(draft, [{ kind: 'put_type', key: 'gizmo', label: 'Gizmo' }]);
    const revision = await publish(withType.draft);
    const gizmoTypeId = typeIdOf(withType.body, 'gizmo');

    // Nothing of this type exists yet: the stem falls back to the runtime
    // type's own label, not to the request name's first letter ('A').
    expect((await suggest({ name: 'Anything', typeKey: 'gizmo' }))[0]).toBe('G001');

    await applyAndCode(createTypedItem(gizmoTypeId, revision, 'First gizmo'), 'G010');

    // Once an item of the runtime type carries a code, suggestion numbers
    // from it, exactly as it does for a built-in type.
    expect(await suggest({ name: 'Another gizmo', typeKey: 'gizmo' })).toEqual([
      'G011',
      'G012',
      'G013',
    ]);
  });

  it('follows a runtime relabel of a built-in type, not the label the type booted with', async () => {
    await activateProtocol2();
    const bootCatalogue = loadPublishedCatalogue(inventoryDb.db);
    if (!bootCatalogue) throw new Error('no boot-time catalogue');
    const storageBox = bootCatalogue.types.find((type) => type.key === 'storage_box');
    if (!storageBox) throw new Error('storage_box type is missing at boot');

    expect((await suggest({ name: 'Box', typeKey: 'storage_box' }))[0]).toBe('S001');

    const draft = await createDraft(bootCatalogue.revision.revision);
    const relabelled = await patch(draft, [
      { kind: 'put_type', id: storageBox.id, label: 'Crate' },
    ]);
    await publish(relabelled.draft);

    // Same key, same stable id, new label: the stem must come from the
    // label the active revision carries now, not the one recorded at boot.
    expect((await suggest({ name: 'Box', typeKey: 'storage_box' }))[0]).toBe('C001');
  });
});
