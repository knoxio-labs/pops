import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport, type BoundAgent } from './test-http.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const transport = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

interface DraftView {
  readonly revision: {
    readonly revision: number;
    readonly baseRevision: number;
    readonly draftVersion: number;
  };
  readonly types: readonly { readonly id: string; readonly label: string }[];
}

function owner(email: string): BoundAgent {
  const rejectServiceAccount: ServiceAccountVerifier = () =>
    Promise.resolve({ outcome: 'rejected' });
  return transport.requestOn(
    createInventoryApiApp({
      inventoryDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3002',
      serviceAccountVerifier: rejectServiceAccount,
      identityResolver: () => Promise.resolve({ user: { email }, serviceAccount: null }),
    })
  );
}

async function openDraft(api: BoundAgent): Promise<{ draft: DraftView; typeIds: string[] }> {
  const current = await api.get('/type-catalogue');
  const created = await api
    .post('/type-catalogue/drafts')
    .send({ baseRevision: current.body.revision.revision });
  expect(created.status).toBe(201);
  const draft = created.body as DraftView;
  return { draft, typeIds: draft.types.map((type) => type.id) };
}

async function readDraft(api: BoundAgent): Promise<DraftView> {
  const response = await api.get('/type-catalogue/drafts/current');
  expect(response.status).toBe(200);
  return response.body as DraftView;
}

function relabel(api: BoundAgent, draft: DraftView, typeId: string, label: string) {
  return api.patch(`/type-catalogue/drafts/${draft.revision.revision}`).send({
    baseRevision: draft.revision.baseRevision,
    expectedDraftVersion: draft.revision.draftVersion,
    operations: [{ kind: 'put_type', id: typeId, label }],
  });
}

function labelOf(draft: DraftView, typeId: string): string | undefined {
  return draft.types.find((type) => type.id === typeId)?.label;
}

async function auditIds(api: BoundAgent): Promise<number[]> {
  const audit = await api.get('/type-catalogue/audit').query({ limit: 50 });
  return (audit.body.events as { id: number }[]).map((event) => event.id);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-type-catalogue-concurrency-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('catalogue draft optimistic concurrency over REST', () => {
  it('lets exactly one of two concurrent readers of the same version write', async () => {
    const alice = owner('alice@example.com');
    const bob = owner('bob@example.com');
    const { typeIds } = await openDraft(alice);
    const typeId = typeIds[0] ?? '';
    const [aliceView, bobView] = await Promise.all([readDraft(alice), readDraft(bob)]);

    const responses = await Promise.all([
      relabel(alice, aliceView, typeId, 'Alice label'),
      relabel(bob, bobView, typeId, 'Bob label'),
    ]);

    const statuses = responses.map((response) => response.status).toSorted();
    expect(statuses).toEqual([200, 409]);
    const winner = responses.find((response) => response.status === 200);
    const loser = responses.find((response) => response.status === 409);
    expect(loser?.body).toMatchObject({
      code: 'catalogue_draft_conflict',
      currentDraftVersion: 2,
      message: expect.stringContaining('re-read the draft'),
    });
    const persisted = await readDraft(alice);
    expect(persisted.revision.draftVersion).toBe(2);
    expect(labelOf(persisted, typeId)).toBe(labelOf(winner?.body.draft as DraftView, typeId));
  });

  it('never lets a stale reader overwrite a newer edit, then accepts its retry', async () => {
    const alice = owner('alice@example.com');
    const bob = owner('bob@example.com');
    const { typeIds } = await openDraft(alice);
    const typeId = typeIds[0] ?? '';
    const staleBobView = await readDraft(bob);

    const aliceWrite = await relabel(alice, await readDraft(alice), typeId, 'Alice label');
    const staleBobWrite = await relabel(bob, staleBobView, typeId, 'Bob label');
    const afterConflict = await readDraft(bob);
    const bobRetry = await relabel(bob, afterConflict, typeId, 'Bob label');

    expect(aliceWrite.status).toBe(200);
    expect(staleBobWrite.status).toBe(409);
    expect(staleBobWrite.body.currentDraftVersion).toBe(afterConflict.revision.draftVersion);
    expect(labelOf(afterConflict, typeId)).toBe('Alice label');
    expect(bobRetry.status).toBe(200);
    expect(bobRetry.body.draft.revision.draftVersion).toBe(3);
    expect(labelOf(bobRetry.body.draft as DraftView, typeId)).toBe('Bob label');
  });

  it('applies independent edits from two editors when each is sequenced after the last', async () => {
    const alice = owner('alice@example.com');
    const bob = owner('bob@example.com');
    const { typeIds } = await openDraft(alice);
    const [firstId = '', secondId = ''] = typeIds;

    const aliceWrite = await relabel(alice, await readDraft(alice), firstId, 'Alice first');
    const bobWrite = await relabel(bob, await readDraft(bob), secondId, 'Bob second');
    const persisted = await readDraft(alice);

    expect([aliceWrite.status, bobWrite.status]).toEqual([200, 200]);
    expect(labelOf(persisted, firstId)).toBe('Alice first');
    expect(labelOf(persisted, secondId)).toBe('Bob second');
    expect(persisted.revision.draftVersion).toBe(3);
  });

  it('refuses an edit racing a publication and keeps the published revision and audit', async () => {
    const alice = owner('alice@example.com');
    const bob = owner('bob@example.com');
    const { draft, typeIds } = await openDraft(alice);
    const typeId = typeIds[0] ?? '';
    const bobView = await readDraft(bob);

    const published = await alice
      .post(`/type-catalogue/drafts/${draft.revision.revision}/publish`)
      .send({
        baseRevision: draft.revision.baseRevision,
        expectedDraftVersion: draft.revision.draftVersion,
        note: 'Alice publishes',
      });
    const auditAfterPublication = await auditIds(alice);
    const lateEdit = await relabel(bob, bobView, typeId, 'Bob late edit');
    const current = await alice.get('/type-catalogue');

    expect(published.status).toBe(200);
    expect(lateEdit.status).toBe(409);
    expect(lateEdit.body).toMatchObject({ code: 'catalogue_draft_conflict' });
    expect(lateEdit.body.message).toContain('already published');
    expect(current.body.revision.revision).toBe(draft.revision.revision);
    expect(labelOf(current.body as DraftView, typeId)).toBe(labelOf(draft, typeId));
    expect(await auditIds(alice)).toEqual(auditAfterPublication);
  });

  it('refuses a publication racing an edit without promoting or auditing it', async () => {
    const alice = owner('alice@example.com');
    const bob = owner('bob@example.com');
    const { draft, typeIds } = await openDraft(alice);
    const typeId = typeIds[0] ?? '';
    const auditBefore = await auditIds(alice);

    await relabel(bob, await readDraft(bob), typeId, 'Bob edit');
    const stalePublish = await alice
      .post(`/type-catalogue/drafts/${draft.revision.revision}/publish`)
      .send({
        baseRevision: draft.revision.baseRevision,
        expectedDraftVersion: draft.revision.draftVersion,
        note: 'Stale publication',
      });
    const reread = await readDraft(alice);
    const retriedPublish = await alice
      .post(`/type-catalogue/drafts/${draft.revision.revision}/publish`)
      .send({
        baseRevision: reread.revision.baseRevision,
        expectedDraftVersion: reread.revision.draftVersion,
        note: 'Reviewed publication',
      });

    expect(stalePublish.status).toBe(409);
    expect(stalePublish.body).toMatchObject({
      code: 'catalogue_draft_conflict',
      currentDraftVersion: 2,
    });
    expect(reread.revision.draftVersion).toBe(2);
    expect(labelOf(reread, typeId)).toBe('Bob edit');
    expect(retriedPublish.status).toBe(200);
    expect(retriedPublish.body.revision.published.note).toBe('Reviewed publication');
    expect((await auditIds(alice)).length).toBe(auditBefore.length + 1);
  });

  it('refuses a stale abandonment without recording one', async () => {
    const alice = owner('alice@example.com');
    const { draft, typeIds } = await openDraft(alice);
    await relabel(alice, draft, typeIds[0] ?? '', 'Still wanted');
    const auditBefore = await auditIds(alice);

    const abandoned = await alice
      .post(`/type-catalogue/drafts/${draft.revision.revision}/abandon`)
      .send({
        baseRevision: draft.revision.baseRevision,
        expectedDraftVersion: draft.revision.draftVersion,
      });

    expect(abandoned.status).toBe(409);
    expect(abandoned.body.currentDraftVersion).toBe(2);
    expect((await readDraft(alice)).revision.draftVersion).toBe(2);
    expect(await auditIds(alice)).toEqual(auditBefore);
  });

  it('checks a preview against the draft version and reports the current one', async () => {
    const alice = owner('alice@example.com');
    const { draft, typeIds } = await openDraft(alice);
    const typeId = typeIds[0] ?? '';
    await relabel(alice, draft, typeId, 'Newer');

    const preview = await alice
      .post(`/type-catalogue/drafts/${draft.revision.revision}/preview`)
      .send({
        baseRevision: draft.revision.baseRevision,
        expectedDraftVersion: draft.revision.draftVersion,
        operations: [{ kind: 'put_type', id: typeId, label: 'Stale preview' }],
      });

    expect(preview.status).toBe(409);
    expect(preview.body).toMatchObject({
      code: 'catalogue_draft_conflict',
      currentDraftVersion: 2,
    });
  });

  it('requires the expected draft version on every mutating draft call', async () => {
    const alice = owner('alice@example.com');
    const { draft, typeIds } = await openDraft(alice);
    const path = `/type-catalogue/drafts/${draft.revision.revision}`;
    const baseRevision = draft.revision.baseRevision;
    const operations = [{ kind: 'put_type', id: typeIds[0], label: 'Unversioned' }];

    const responses = await Promise.all([
      alice.patch(path).send({ baseRevision, operations }),
      alice.post(`${path}/preview`).send({ baseRevision, operations }),
      alice.post(`${path}/publish`).send({ baseRevision }),
      alice.post(`${path}/abandon`).send({ baseRevision }),
    ]);

    expect(responses.map((response) => response.status)).toEqual([400, 400, 400, 400]);
    expect((await readDraft(alice)).revision.draftVersion).toBe(1);
  });
});
