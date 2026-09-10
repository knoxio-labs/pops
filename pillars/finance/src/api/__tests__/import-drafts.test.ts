/**
 * Integration tests for `import-drafts` (POPS-3329, finance ADR-005): the
 * lease's two refusals, the two ways a draft becomes unusable, and what
 * discard does and does not touch.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { IMPORT_DRAFT_SHAPE_VERSION } from '../../contract/import-draft.js';
import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { insertBatch } from '../../db/services/import-batches.js';
import { createImportDraft } from '../../db/services/import-drafts.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-import-drafts-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function client() {
  return makeClient(
    createFinanceApiApp({
      financeDb,
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3004',
      contacts: makeContactsFake(),
    })
  );
}

async function anAccount(name = 'Everyday') {
  const created = await client().accounts.create({ name, kind: 'checking', currency: 'AUD' });
  return created.data.id;
}

const TAB_A = 'tab-aaaaaaaa';
const TAB_B = 'tab-bbbbbbbb';

function fileDraftBody(accountId: string, overrides: Record<string, unknown> = {}) {
  return {
    accountId,
    dialectId: 'amex',
    fileNames: ['activity_2026-08.csv'],
    payload: { currentStep: 4, rows: [{ a: 1 }] },
    step: 4,
    rowCount: 46,
    unresolvedCount: 3,
    span: { from: '2026-08-01', to: '2026-08-31' },
    ownerToken: TAB_A,
    ...overrides,
  };
}

async function aFileDraft(accountId: string) {
  return (await client().importDrafts.create(fileDraftBody(accountId))).data;
}

function aLiveDraft(accountId: string) {
  return createImportDraft(financeDb.db, {
    accountId,
    sourceKind: 'live',
    state: 'live',
    provider: 'up',
    payload: JSON.stringify({ rows: [] }),
    rowCount: 11,
    unresolvedCount: 2,
    dateFrom: '2026-09-02',
    dateTo: '2026-09-10',
    balanceReportedCents: 61_215,
  });
}

function setOwnerSeenAt(id: string, iso: string) {
  financeDb.raw.prepare('UPDATE import_drafts SET owner_seen_at = ? WHERE id = ?').run(iso, id);
}

function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

describe('create and read', () => {
  it('creates a file draft the creating tab holds, and serves it with its payload', async () => {
    const accountId = await anAccount();
    const created = await aFileDraft(accountId);

    expect(created).toMatchObject({
      accountId,
      source: { kind: 'file', dialectId: 'amex', fileNames: ['activity_2026-08.csv'] },
      state: 'open',
      step: 4,
      rowCount: 46,
      unresolvedCount: 3,
      span: { from: '2026-08-01', to: '2026-08-31' },
      balanceReportedCents: null,
      unusableCause: null,
      unusableReason: null,
    });
    expect(created.ownerSeenAt).not.toBeNull();

    const read = await client().importDrafts.get(created.id);
    expect(read.data).toMatchObject({
      id: created.id,
      shapeVersion: IMPORT_DRAFT_SHAPE_VERSION,
      payload: { currentStep: 4, rows: [{ a: 1 }] },
    });
  });

  it('404s a create for an account that does not exist and a read of a draft that does not', async () => {
    await expect(client().importDrafts.create(fileDraftBody('nope'))).rejects.toMatchObject({
      status: 404,
    });
    await expect(client().importDrafts.get('nope')).rejects.toMatchObject({ status: 404 });
  });

  it('400s a create with no file names or a short owner token', async () => {
    const accountId = await anAccount();
    await expect(
      client().importDrafts.create(fileDraftBody(accountId, { fileNames: [] }))
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      client().importDrafts.create(fileDraftBody(accountId, { ownerToken: 'x' }))
    ).rejects.toMatchObject({ status: 400 });
  });
});

describe('list', () => {
  it('lists every draft newest first with the derived state, and filters by account and state', async () => {
    const a = await anAccount('A');
    const b = await anAccount('B');
    const live = aLiveDraft(a);
    const fileA = await aFileDraft(a);
    await client().importDrafts.release(fileA.id, { ownerToken: TAB_A });
    const fileB = await aFileDraft(b);

    const all = (await client().importDrafts.list()).data;
    expect(all.map((d) => d.id)).toEqual([fileB.id, fileA.id, live.id]);
    expect(all.map((d) => d.state)).toEqual(['open', 'saved', 'live']);
    expect(all[2]).toMatchObject({
      source: { kind: 'live', provider: 'up' },
      balanceReportedCents: 61_215,
      step: null,
    });

    const forA = (await client().importDrafts.list({ account: a })).data;
    expect(forA.map((d) => d.id)).toEqual([fileA.id, live.id]);
    const liveOnly = (await client().importDrafts.list({ account: a, state: 'live' })).data;
    expect(liveOnly.map((d) => d.id)).toEqual([live.id]);
  });

  it('reports open while the owner was seen inside 24h and left-open after', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);

    setOwnerSeenAt(draft.id, hoursAgo(23));
    expect((await client().importDrafts.list()).data[0]?.state).toBe('open');

    setOwnerSeenAt(draft.id, hoursAgo(25));
    expect((await client().importDrafts.list()).data[0]?.state).toBe('left-open');
  });
});

describe('write', () => {
  it('replaces payload, step and counts for the owner', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);

    const written = await client().importDrafts.write(draft.id, {
      ownerToken: TAB_A,
      payload: { currentStep: 5 },
      step: 5,
      rowCount: 46,
      unresolvedCount: 0,
      span: { from: '2026-08-01', to: '2026-08-31' },
      processSessionId: 'sess-1',
    });
    expect(written.data).toMatchObject({ step: 5, unresolvedCount: 0, processSessionId: 'sess-1' });
    expect((await client().importDrafts.get(draft.id)).data.payload).toEqual({ currentStep: 5 });
  });

  it('409s DraftOwnedElsewhere from a token that is not the owner and leaves the draft unchanged', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);

    await expect(
      client().importDrafts.write(draft.id, {
        ownerToken: TAB_B,
        payload: { stolen: true },
        step: 1,
        rowCount: 0,
        unresolvedCount: 0,
        span: null,
      })
    ).rejects.toMatchObject({
      status: 409,
      body: { code: 'DraftOwnedElsewhere', messageKey: 'finance.importDrafts.ownedElsewhere' },
    });

    const after = await client().importDrafts.get(draft.id);
    expect(after.data).toMatchObject({ step: 4, rowCount: 46, payload: { currentStep: 4 } });
  });

  it('404s a write to a draft that does not exist', async () => {
    await expect(
      client().importDrafts.write('nope', {
        ownerToken: TAB_A,
        payload: {},
        step: 1,
        rowCount: 0,
        unresolvedCount: 0,
        span: null,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('claim, heartbeat, release', () => {
  it('refuses a second tab while the first was seen recently, admits it with force, and the first then fails its heartbeat', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);

    await expect(
      client().importDrafts.claim(draft.id, { ownerToken: TAB_B })
    ).rejects.toMatchObject({ status: 409, body: { code: 'DraftOwnedElsewhere' } });

    const taken = await client().importDrafts.claim(draft.id, { ownerToken: TAB_B, force: true });
    expect(taken.data.state).toBe('open');

    await expect(
      client().importDrafts.heartbeat(draft.id, { ownerToken: TAB_A })
    ).rejects.toMatchObject({ status: 409, body: { code: 'DraftOwnedElsewhere' } });
    const beat = await client().importDrafts.heartbeat(draft.id, { ownerToken: TAB_B });
    expect(beat.data.state).toBe('open');
  });

  it('admits a second tab without force once the first is stale', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);
    setOwnerSeenAt(draft.id, hoursAgo(25));

    const taken = await client().importDrafts.claim(draft.id, { ownerToken: TAB_B });
    expect(taken.data.state).toBe('open');
  });

  it('claiming a live draft turns it saved so it stops collecting, inventing no step', async () => {
    const accountId = await anAccount();
    const live = aLiveDraft(accountId);

    const claimed = await client().importDrafts.claim(live.id, { ownerToken: TAB_A });
    expect(claimed.data).toMatchObject({ state: 'open', step: null });
    await client().importDrafts.release(live.id, { ownerToken: TAB_A });

    const listed = (await client().importDrafts.list({ account: accountId })).data;
    expect(listed[0]).toMatchObject({ id: live.id, state: 'saved', source: { kind: 'live' } });
    expect((await client().importDrafts.list({ account: accountId, state: 'live' })).data).toEqual(
      []
    );
  });

  it('release makes the card read saved, and a stranger releasing changes nothing', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);

    await client().importDrafts.release(draft.id, { ownerToken: TAB_B });
    expect((await client().importDrafts.list()).data[0]?.state).toBe('open');

    await client().importDrafts.release(draft.id, { ownerToken: TAB_A });
    expect((await client().importDrafts.list()).data[0]).toMatchObject({
      state: 'saved',
      ownerSeenAt: null,
    });
    await expect(
      client().importDrafts.release('nope', { ownerToken: TAB_A })
    ).rejects.toMatchObject({ status: 404 });
  });
});

describe('unusable', () => {
  it('lists a draft written under another shape version as unusable with the deploy reason, and refuses to serve it', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);
    financeDb.raw
      .prepare('UPDATE import_drafts SET shape_version = ? WHERE id = ?')
      .run(IMPORT_DRAFT_SHAPE_VERSION + 1, draft.id);

    const listed = (await client().importDrafts.list()).data[0];
    expect(listed).toMatchObject({ state: 'unusable', unusableCause: 'shape' });
    expect(listed?.unusableReason).toMatch(/upload it again/);

    await expect(client().importDrafts.get(draft.id)).rejects.toMatchObject({
      status: 409,
      body: { code: 'DraftUnusable', messageKey: 'finance.importDrafts.unusable' },
    });
  });

  it('words the shape reason for a live draft around the next sync, not a file', async () => {
    const accountId = await anAccount();
    const live = aLiveDraft(accountId);
    financeDb.raw.prepare('UPDATE import_drafts SET shape_version = 0 WHERE id = ?').run(live.id);

    const listed = (await client().importDrafts.list()).data[0];
    expect(listed?.unusableReason).toMatch(/next sync/);
    expect(listed?.unusableReason).not.toMatch(/upload/);
  });

  it('lists a draft for an archived account as unusable naming the account, and refuses to serve it', async () => {
    const accountId = await anAccount('Old ING Orange');
    const draft = await aFileDraft(accountId);
    await client().accounts.delete(accountId);

    const listed = (await client().importDrafts.list()).data[0];
    expect(listed).toMatchObject({ state: 'unusable', unusableCause: 'account-archived' });
    expect(listed?.unusableReason).toMatch(/^Old ING Orange was archived on /);
    expect(listed?.unusableReason).toMatch(/Restore the account/);

    await expect(client().importDrafts.get(draft.id)).rejects.toMatchObject({ status: 409 });
  });

  it('unusable wins over open: an archived account leaves nothing to take over', async () => {
    const accountId = await anAccount();
    await aFileDraft(accountId);
    await client().accounts.delete(accountId);
    expect((await client().importDrafts.list()).data[0]?.state).toBe('unusable');
  });

  it('an unusable draft can still be discarded', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);
    financeDb.raw.prepare('UPDATE import_drafts SET shape_version = 0 WHERE id = ?').run(draft.id);

    await client().importDrafts.discard(draft.id);
    expect((await client().importDrafts.list()).data).toEqual([]);
  });
});

describe('discard', () => {
  it('deletes the draft and 404s a second discard', async () => {
    const accountId = await anAccount();
    const draft = await aFileDraft(accountId);

    await client().importDrafts.discard(draft.id);
    await expect(client().importDrafts.get(draft.id)).rejects.toMatchObject({ status: 404 });
    await expect(client().importDrafts.discard(draft.id)).rejects.toMatchObject({ status: 404 });
  });

  it('discarding a live draft leaves import_batches and transactions untouched', async () => {
    const accountId = await anAccount();
    insertBatch(financeDb.db, { accountId, sourceKind: 'api', sourceRef: 'up', rowCount: 1 }, []);
    const live = aLiveDraft(accountId);
    const before = {
      batches: financeDb.raw.prepare('SELECT COUNT(*) AS n FROM import_batches').get(),
      transactions: financeDb.raw.prepare('SELECT COUNT(*) AS n FROM transactions').get(),
    };

    await client().importDrafts.discard(live.id);

    expect(financeDb.raw.prepare('SELECT COUNT(*) AS n FROM import_batches').get()).toEqual(
      before.batches
    );
    expect(financeDb.raw.prepare('SELECT COUNT(*) AS n FROM transactions').get()).toEqual(
      before.transactions
    );
    expect((await client().importDrafts.list({ account: accountId })).data).toEqual([]);
  });
});
