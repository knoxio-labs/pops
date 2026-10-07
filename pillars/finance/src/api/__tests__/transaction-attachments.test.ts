/**
 * Integration tests for the files attached to a transaction (POPS-5870). Real
 * Express app, real SQLite file, real signed Access tokens, and an in-memory
 * receipt store in place of the purchases pillar.
 *
 * The route tier is the cheapest one that sees this: the answer depends on who
 * the scope gate resolved the request to, on the grant held on the account the
 * transaction sits on at that moment, and on the order finance talks to the
 * store and to its own tables in.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ACCESS_JWT_HEADER } from '@pops/pillar-express';
import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import {
  accountGrantsService,
  openFinanceDb,
  transactionsService,
  type OpenedFinanceDb,
} from '../../db/index.js';
import { createAccount } from '../../db/services/accounts.js';
import { createFinanceApiApp } from '../app.js';
import { makeContactsFake } from './contacts-fake.js';
import { makePurchasesFake, type PurchasesFake, receiptUriOf } from './purchases-fake.js';
import { requestOn } from './test-utils.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const AUDIENCE = 'aud-under-test';
const access = createAccessJwtFixture({ audience: AUDIENCE });

const OPERATOR = 'owner@pops.test';
/** Holds `view` on the shared account only. */
const ROSANE = 'rosane@example.test';
/** Holds `edit` on the shared account and `view` on the read-only one. */
const CARLOS = 'carlos@example.test';
const API_KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';
const NO_SUCH_ID = 'no-such-id';

const PHOTO = { mediaType: 'image/jpeg', dataBase64: Buffer.from('a photo').toString('base64') };
const SECOND_PHOTO = {
  mediaType: 'image/png',
  dataBase64: Buffer.from('another photo').toString('base64'),
};
const INVOICE = {
  mediaType: 'application/pdf',
  dataBase64: Buffer.from('an invoice').toString('base64'),
};

const UNAVAILABLE = 'finance.dependency.unavailable';

const financeWideKey: ServiceAccountVerifier = () =>
  Promise.resolve({
    outcome: 'authenticated',
    principal: { id: 'sa_bfm', name: 'bfm', scopes: ['finance'] },
  });

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let purchases: PurchasesFake;
/** Granted to Rosane (`view`) and Carlos (`edit`). */
let shared: string;
/** Granted to Carlos (`view`) only. */
let readOnly: string;
/** Granted to nobody. */
let privateAccount: string;
let onShared: string;
let alsoOnShared: string;
let onPrivate: string;

function enforceAccess(): void {
  vi.stubEnv('POPS_OPERATOR_EMAILS', OPERATOR);
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', access.teamName);
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', AUDIENCE);
}

function anEntry(accountId: string, description: string): string {
  return transactionsService.createTransaction(financeDb.db, {
    description,
    accountId,
    amountCents: -4200,
    date: '2026-03-01',
    type: 'purchase',
    tags: [],
  }).id;
}

function grant(email: string, accountId: string, role: 'view' | 'edit'): void {
  accountGrantsService.upsertGrant(financeDb.db, { accountId, email, role, actor: OPERATOR });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-transaction-attachments-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  purchases = makePurchasesFake();
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  vi.stubGlobal('fetch', access.fetchImpl);
  vi.stubEnv('POPS_OPERATOR_EMAILS', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_TEAM_NAME', '');
  vi.stubEnv('CLOUDFLARE_ACCESS_AUD', '');

  const account = (name: string) =>
    createAccount(financeDb.db, { name, kind: 'checking', currency: 'AUD' }).id;
  shared = account('Shared');
  readOnly = account('Read only');
  privateAccount = account('Private');

  onShared = anEntry(shared, 'Groceries');
  alsoOnShared = anEntry(shared, 'Bakery');
  onPrivate = anEntry(privateAccount, 'Mortgage');

  grant(ROSANE, shared, 'view');
  grant(CARLOS, shared, 'edit');
  grant(CARLOS, readOnly, 'view');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

interface Caller {
  /** Email to sign an Access token for. */
  readonly as?: string;
  /** Present an `X-API-Key` the registry resolves to a finance-wide grant. */
  readonly withKey?: boolean;
}

type Method = 'get' | 'post' | 'patch' | 'delete';

function call(method: Method, path: string, caller: Caller, body?: object) {
  const app = createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
    purchases,
    serviceAccountVerifier: financeWideKey,
  });
  return requestOn(app, (agent) => {
    let req = agent[method](path);
    if (caller.as !== undefined) req = req.set(ACCESS_JWT_HEADER, access.signForEmail(caller.as));
    if (caller.withKey === true) req = req.set('x-api-key', API_KEY);
    return body === undefined ? req : req.send(body);
  });
}

const attach = (caller: Caller, id: string, body: object) =>
  call('post', `/transactions/${id}/attachments`, caller, body);
const list = (caller: Caller, id: string) => call('get', `/transactions/${id}/attachments`, caller);
const read = (caller: Caller, id: string, attachmentId: string) =>
  call('get', `/transactions/${id}/attachments/${attachmentId}`, caller);
const thumbnail = (caller: Caller, id: string, attachmentId: string) =>
  call('get', `/transactions/${id}/attachments/${attachmentId}/thumbnail`, caller);
const detach = (caller: Caller, id: string, attachmentId: string) =>
  call('delete', `/transactions/${id}/attachments/${attachmentId}`, caller);

const ownerUri = (id: string) => `pops://finance/transaction/${id}`;

interface AttachmentRow {
  id: string;
  transaction_id: string;
  document_uri: string;
  media_type: string;
  position: number;
  created_by: string | null;
}

function isAttachmentRow(row: unknown): row is AttachmentRow {
  return typeof row === 'object' && row !== null && 'document_uri' in row && 'position' in row;
}

function rowsOf(id: string): AttachmentRow[] {
  return financeDb.raw
    .prepare('SELECT * FROM transaction_attachments WHERE transaction_id = ? ORDER BY position')
    .all(id)
    .filter(isAttachmentRow);
}

function eventsOf(id: string): unknown[] {
  return financeDb.raw
    .prepare(
      'SELECT action, actor_kind, actor_email, account_id FROM transaction_events ' +
        'WHERE transaction_id = ? ORDER BY rowid'
    )
    .all(id);
}

/** Every attachment row and every event, so "nothing was written" is one comparison. */
function written(): unknown {
  return {
    attachments: financeDb.raw.prepare('SELECT * FROM transaction_attachments ORDER BY id').all(),
    events: financeDb.raw.prepare('SELECT * FROM transaction_events ORDER BY rowid').all(),
  };
}

/** Attach one photo as the operator and answer the new attachment's id. */
async function attached(id: string, part = PHOTO): Promise<string> {
  const response = await attach({ as: OPERATOR }, id, { parts: [part] });
  expect(response.status).toBe(201);
  return response.body.data[0].id;
}

describe('with no operator list set', () => {
  it('lets a caller with no token attach, list, open and remove a file', async () => {
    const created = await attach({}, onShared, { parts: [PHOTO] });
    expect(created.status).toBe(201);
    const attachmentId: string = created.body.data[0].id;

    expect((await list({}, onShared)).body.data).toHaveLength(1);
    expect((await read({}, onShared, attachmentId)).body.data).toMatchObject({
      mediaType: 'image/jpeg',
      dataBase64: PHOTO.dataBase64,
    });
    expect((await thumbnail({}, onShared, attachmentId)).status).toBe(200);
    expect((await detach({}, onShared, attachmentId)).status).toBe(200);
    expect(rowsOf(onShared)).toEqual([]);
  });

  it('treats any signed-in email as the operator, on an account nobody was granted', async () => {
    const response = await attach({ as: ROSANE }, onPrivate, { parts: [PHOTO] });

    expect(response.status).toBe(201);
    expect((await list({ as: ROSANE }, onPrivate)).status).toBe(200);
  });
});

describe('who may reach a transaction’s files, with Access enforced', () => {
  beforeEach(enforceAccess);

  it.each([
    ['the operator', { as: OPERATOR }],
    ['a guest holding edit', { as: CARLOS }],
    ['a service key', { withKey: true }],
  ])('lets %s attach, list, open and remove', async (_who, caller) => {
    const created = await attach(caller, onShared, { parts: [PHOTO] });
    expect(created.status).toBe(201);
    const attachmentId: string = created.body.data[0].id;

    expect((await list(caller, onShared)).status).toBe(200);
    expect((await read(caller, onShared, attachmentId)).status).toBe(200);
    expect((await thumbnail(caller, onShared, attachmentId)).status).toBe(200);
    expect((await detach(caller, onShared, attachmentId)).status).toBe(200);
  });

  it('lets a guest holding view list and open, and refuses it attach and remove', async () => {
    const attachmentId = await attached(onShared);
    const before = written();

    expect((await list({ as: ROSANE }, onShared)).body.data).toHaveLength(1);
    expect((await read({ as: ROSANE }, onShared, attachmentId)).status).toBe(200);
    expect((await thumbnail({ as: ROSANE }, onShared, attachmentId)).status).toBe(200);

    const refusedAttach = await attach({ as: ROSANE }, onShared, { parts: [SECOND_PHOTO] });
    expect(refusedAttach.status).toBe(403);
    expect(refusedAttach.body.code).toBe('finance.resource.forbidden');
    expect((await detach({ as: ROSANE }, onShared, attachmentId)).status).toBe(403);
    expect(written()).toEqual(before);
  });

  it('stores nothing in purchases for a caller it refuses', async () => {
    await attach({ as: ROSANE }, onShared, { parts: [PHOTO] });
    await attach({ as: CARLOS }, onPrivate, { parts: [PHOTO] });

    expect(purchases.calls).toEqual([]);
  });

  it('answers 404 on every route for a transaction on an account the guest was not granted', async () => {
    const attachmentId = await attached(onPrivate);
    const before = written();

    const responses = [
      await attach({ as: CARLOS }, onPrivate, { parts: [SECOND_PHOTO] }),
      await list({ as: CARLOS }, onPrivate),
      await read({ as: CARLOS }, onPrivate, attachmentId),
      await thumbnail({ as: CARLOS }, onPrivate, attachmentId),
      await detach({ as: CARLOS }, onPrivate, attachmentId),
    ];

    expect(responses.map((response) => response.status)).toEqual([404, 404, 404, 404, 404]);
    expect(written()).toEqual(before);
  });

  it('answers an ungranted transaction exactly as it answers a missing one', async () => {
    const strip = (response: { status: number; body: Record<string, unknown> }, id: string) => {
      const { requestId: _requestId, ...rest } = response.body;
      return {
        status: response.status,
        body: JSON.parse(JSON.stringify(rest).replaceAll(id, ':id')),
      };
    };

    expect(strip(await list({ as: CARLOS }, onPrivate), onPrivate)).toEqual(
      strip(await list({ as: CARLOS }, NO_SUCH_ID), NO_SUCH_ID)
    );
  });

  it('answers 404 for a missing transaction to the operator too', async () => {
    expect((await list({ as: OPERATOR }, NO_SUCH_ID)).status).toBe(404);
    expect((await attach({ as: OPERATOR }, NO_SUCH_ID, { parts: [PHOTO] })).status).toBe(404);
    expect(purchases.calls).toEqual([]);
  });

  it('answers 404 for an attachment id that belongs to another transaction', async () => {
    const attachmentId = await attached(onShared);

    expect((await read({ as: CARLOS }, alsoOnShared, attachmentId)).status).toBe(404);
    expect((await thumbnail({ as: CARLOS }, alsoOnShared, attachmentId)).status).toBe(404);
    expect((await detach({ as: CARLOS }, alsoOnShared, attachmentId)).status).toBe(404);
    expect(rowsOf(onShared)).toHaveLength(1);
    expect(purchases.pinsOf(ownerUri(onShared))).toEqual([receiptUriOf(PHOTO)]);
  });

  it('decides by the account the transaction sits on now, after it is moved', async () => {
    const attachmentId = await attached(onShared);

    const toReadOnly = await call(
      'patch',
      `/transactions/${onShared}`,
      { as: OPERATOR },
      {
        accountId: readOnly,
      }
    );
    expect(toReadOnly.status).toBe(200);
    expect((await read({ as: CARLOS }, onShared, attachmentId)).status).toBe(200);
    expect((await attach({ as: CARLOS }, onShared, { parts: [SECOND_PHOTO] })).status).toBe(403);
    expect((await list({ as: ROSANE }, onShared)).status).toBe(404);

    await call(
      'patch',
      `/transactions/${onShared}`,
      { as: OPERATOR },
      {
        accountId: privateAccount,
      }
    );
    expect((await list({ as: CARLOS }, onShared)).status).toBe(404);
    expect((await read({ as: CARLOS }, onShared, attachmentId)).status).toBe(404);
    expect((await detach({ as: CARLOS }, onShared, attachmentId)).status).toBe(404);
    expect(rowsOf(onShared)).toHaveLength(1);
  });

  it('refuses an attach whose transaction moved out of reach while purchases was answering', async () => {
    purchases.onCall((made) => {
      if (made.operation !== 'addReferences') return;
      transactionsService.updateTransaction(financeDb.db, onShared, { accountId: privateAccount });
    });

    const response = await attach({ as: CARLOS }, onShared, { parts: [PHOTO] });

    expect(response.status).toBe(404);
    expect(rowsOf(onShared)).toEqual([]);
  });
});

describe('attaching', () => {
  beforeEach(enforceAccess);

  it('keeps several files in the order they were sent, and carries on after the last', async () => {
    const first = await attach({ as: CARLOS }, onShared, { parts: [PHOTO, INVOICE] });
    const second = await attach({ as: CARLOS }, onShared, { parts: [SECOND_PHOTO] });

    expect(first.status).toBe(201);
    expect(first.body.data.map((row: { documentUri: string }) => row.documentUri)).toEqual([
      receiptUriOf(PHOTO),
      receiptUriOf(INVOICE),
    ]);
    expect(second.body.data).toHaveLength(1);
    expect(
      rowsOf(onShared).map((row) => [
        row.position,
        row.document_uri,
        row.media_type,
        row.created_by,
      ])
    ).toEqual([
      [0, receiptUriOf(PHOTO), 'image/jpeg', CARLOS],
      [1, receiptUriOf(INVOICE), 'application/pdf', CARLOS],
      [2, receiptUriOf(SECOND_PHOTO), 'image/png', CARLOS],
    ]);
    expect((await list({ as: ROSANE }, onShared)).body.data).toMatchObject([
      { position: 0, mediaType: 'image/jpeg', transactionId: onShared, createdBy: CARLOS },
      { position: 1, mediaType: 'application/pdf' },
      { position: 2, mediaType: 'image/png' },
    ]);
  });

  it('pins the file for the transaction before it writes the row', async () => {
    const rowsWhenPinned: number[] = [];
    purchases.onCall((made) => {
      if (made.operation === 'addReferences') rowsWhenPinned.push(rowsOf(onShared).length);
    });

    await attach({ as: CARLOS }, onShared, { parts: [PHOTO] });

    expect(purchases.calls).toEqual([
      { operation: 'store' },
      {
        operation: 'addReferences',
        ownerUri: ownerUri(onShared),
        receiptUris: [receiptUriOf(PHOTO)],
      },
    ]);
    expect(rowsWhenPinned).toEqual([0]);
    expect(rowsOf(onShared)).toHaveLength(1);
  });

  it('writes one attach event per file, naming who attached it', async () => {
    await attach({ as: CARLOS }, onShared, { parts: [PHOTO, INVOICE] });

    expect(eventsOf(onShared)).toEqual([
      { action: 'attach', actor_kind: 'guest', actor_email: CARLOS, account_id: shared },
      { action: 'attach', actor_kind: 'guest', actor_email: CARLOS, account_id: shared },
    ]);
    const history = await call('get', `/transactions/${onShared}/history`, { as: CARLOS });
    expect(history.status).toBe(200);
    expect(history.body.data.map((event: { action: string }) => event.action)).toEqual([
      'attach',
      'attach',
    ]);
  });

  it('records a service caller with no email', async () => {
    await attach({ withKey: true }, onShared, { parts: [PHOTO] });

    expect(rowsOf(onShared)[0]?.created_by).toBeNull();
    expect(eventsOf(onShared)).toEqual([
      { action: 'attach', actor_kind: 'service', actor_email: null, account_id: shared },
    ]);
  });

  it('does not add a file the transaction already holds a second time', async () => {
    const first = await attach({ as: CARLOS }, onShared, { parts: [PHOTO] });
    const again = await attach({ as: CARLOS }, onShared, { parts: [PHOTO, PHOTO, INVOICE] });

    expect(again.status).toBe(201);
    expect(again.body.data.map((row: { id: string }) => row.id)[0]).toBe(first.body.data[0].id);
    expect(again.body.data).toHaveLength(2);
    expect(rowsOf(onShared).map((row) => row.position)).toEqual([0, 1]);
    expect(eventsOf(onShared)).toHaveLength(2);
  });

  it('attaches files the store already holds, by URI, with the type the store reports', async () => {
    const uri = purchases.seed(INVOICE);

    const response = await attach({ as: CARLOS }, onShared, { receiptUris: [uri] });

    expect(response.status).toBe(201);
    expect(rowsOf(onShared)).toMatchObject([
      { document_uri: uri, media_type: 'application/pdf', position: 0 },
    ]);
    expect(purchases.pinsOf(ownerUri(onShared))).toEqual([uri]);
  });

  it('answers 404 and writes nothing for a URI the store does not hold', async () => {
    const before = written();

    const response = await attach({ as: CARLOS }, onShared, {
      receiptUris: [receiptUriOf(PHOTO)],
    });

    expect(response.status).toBe(404);
    expect(written()).toEqual(before);
    expect(purchases.pinsOf(ownerUri(onShared))).toEqual([]);
  });

  it.each([
    ['neither files nor URIs', {}],
    ['both files and URIs', { parts: [PHOTO], receiptUris: [receiptUriOf(PHOTO)] }],
    ['no files', { parts: [] }],
    ['a URI that is not a receipt URI', { receiptUris: ['pops://finance/transaction/abc'] }],
    ['a field it does not know', { parts: [PHOTO], ownerUri: 'pops://finance/transaction/x' }],
  ])('answers 400 for a body with %s', async (_what, body) => {
    const response = await attach({ as: CARLOS }, onShared, body);

    expect(response.status).toBe(400);
    expect(purchases.calls).toEqual([]);
    expect(rowsOf(onShared)).toEqual([]);
  });

  it('answers 400 and writes nothing for a file the store refuses', async () => {
    const before = written();

    const response = await attach({ as: CARLOS }, onShared, {
      parts: [PHOTO, { mediaType: 'video/mp4', dataBase64: PHOTO.dataBase64 }],
    });

    expect(response.status).toBe(400);
    expect(written()).toEqual(before);
  });
});

describe('while purchases cannot be reached', () => {
  beforeEach(enforceAccess);

  it.each([
    ['new files', () => ({ parts: [PHOTO] })],
    ['stored URIs', () => ({ receiptUris: [receiptUriOf(PHOTO)] })],
  ])('answers a typed 503 to an attach of %s and writes nothing', async (_what, body) => {
    const before = written();
    purchases.setUnavailable(true);

    const response = await attach({ as: CARLOS }, onShared, body());

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: UNAVAILABLE, retryable: true });
    expect(written()).toEqual(before);
  });

  it('writes nothing when the store took the file and the pin then failed', async () => {
    const before = written();
    purchases.onCall((made) => {
      if (made.operation === 'addReferences') purchases.setUnavailable(true);
    });

    const response = await attach({ as: CARLOS }, onShared, { parts: [PHOTO] });

    expect(response.status).toBe(503);
    expect(written()).toEqual(before);
  });

  it('answers 503 for a file’s bytes and its thumbnail, and still lists', async () => {
    const attachmentId = await attached(onShared);
    purchases.setUnavailable(true);

    expect((await read({ as: ROSANE }, onShared, attachmentId)).body.code).toBe(UNAVAILABLE);
    expect((await thumbnail({ as: ROSANE }, onShared, attachmentId)).status).toBe(503);
    expect((await list({ as: ROSANE }, onShared)).body.data).toHaveLength(1);
  });
});

describe('opening a file', () => {
  beforeEach(enforceAccess);

  it('passes a PDF’s missing thumbnail through as 415, and still serves its bytes', async () => {
    const attachmentId = await attached(onShared, INVOICE);

    const picture = await thumbnail({ as: ROSANE }, onShared, attachmentId);
    expect(picture.status).toBe(415);
    expect(picture.body.code).toBe('finance.resource.unsupported_media_type');
    expect((await read({ as: ROSANE }, onShared, attachmentId)).body.data).toMatchObject({
      mediaType: 'application/pdf',
      dataBase64: INVOICE.dataBase64,
    });
  });

  it('answers 404 for an attachment id the transaction does not hold', async () => {
    expect((await read({ as: CARLOS }, onShared, NO_SUCH_ID)).status).toBe(404);
    expect((await thumbnail({ as: CARLOS }, onShared, NO_SUCH_ID)).status).toBe(404);
    expect(purchases.calls).toEqual([]);
  });
});

describe('detaching', () => {
  beforeEach(enforceAccess);

  it('removes the row, writes a detach event, then releases that one pin', async () => {
    const kept = await attached(onShared, INVOICE);
    const attachmentId = await attached(onShared);
    const rowsWhenReleased: number[] = [];
    purchases.onCall((made) => {
      if (made.operation === 'removeReferences') rowsWhenReleased.push(rowsOf(onShared).length);
    });

    const response = await detach({ as: CARLOS }, onShared, attachmentId);

    expect(response.status).toBe(200);
    expect(rowsOf(onShared).map((row) => row.id)).toEqual([kept]);
    expect(rowsWhenReleased).toEqual([1]);
    expect(purchases.calls.at(-1)).toEqual({
      operation: 'removeReferences',
      ownerUri: ownerUri(onShared),
      receiptUris: [receiptUriOf(PHOTO)],
    });
    expect(purchases.pinsOf(ownerUri(onShared))).toEqual([receiptUriOf(INVOICE)]);
    expect(eventsOf(onShared).at(-1)).toEqual({
      action: 'detach',
      actor_kind: 'guest',
      actor_email: CARLOS,
      account_id: shared,
    });
  });

  it('answers 404 the second time and writes no second event', async () => {
    const attachmentId = await attached(onShared);
    await detach({ as: CARLOS }, onShared, attachmentId);
    const before = written();

    expect((await detach({ as: CARLOS }, onShared, attachmentId)).status).toBe(404);
    expect(written()).toEqual(before);
  });

  it('still removes the row when the pin cannot be released, and logs it', async () => {
    const attachmentId = await attached(onShared);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    purchases.failRelease(true);

    const response = await detach({ as: CARLOS }, onShared, attachmentId);

    expect(response.status).toBe(200);
    expect(rowsOf(onShared)).toEqual([]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(onShared));
  });
});

describe('deleting a transaction that holds files', () => {
  beforeEach(enforceAccess);

  const remove = (caller: Caller, id: string) => call('delete', `/transactions/${id}`, caller);

  it('releases every pin the transaction held, after the row is gone', async () => {
    await attach({ as: CARLOS }, onShared, { parts: [PHOTO, INVOICE] });
    const transactionsWhenReleased: number[] = [];
    purchases.onCall((made) => {
      if (made.operation !== 'removeReferences') return;
      transactionsWhenReleased.push(
        financeDb.raw.prepare('SELECT id FROM transactions WHERE id = ?').all(onShared).length
      );
    });

    const response = await remove({ as: CARLOS }, onShared);

    expect(response.status).toBe(200);
    expect(transactionsWhenReleased).toEqual([0]);
    expect(purchases.calls.at(-1)).toEqual({
      operation: 'removeReferences',
      ownerUri: ownerUri(onShared),
      receiptUris: undefined,
    });
    expect(purchases.pinsOf(ownerUri(onShared))).toEqual([]);
    expect(rowsOf(onShared)).toEqual([]);
  });

  it('does not call purchases for a transaction that held none', async () => {
    expect((await remove({ as: CARLOS }, onShared)).status).toBe(200);
    expect(purchases.calls).toEqual([]);
  });

  it('still deletes when the pins cannot be released, and logs it', async () => {
    await attached(onShared);
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    purchases.failRelease(true);

    const response = await remove({ as: CARLOS }, onShared);

    expect(response.status).toBe(200);
    expect(financeDb.raw.prepare('SELECT id FROM transactions WHERE id = ?').all(onShared)).toEqual(
      []
    );
    expect(purchases.pinsOf(ownerUri(onShared))).toEqual([receiptUriOf(PHOTO)]);
    expect(logged).toHaveBeenCalledWith(expect.stringContaining(onShared));
  });

  it('leaves the pins alone when the delete itself is refused', async () => {
    await attached(onShared);

    expect((await remove({ as: ROSANE }, onShared)).status).toBe(403);
    expect(purchases.pinsOf(ownerUri(onShared))).toEqual([receiptUriOf(PHOTO)]);
    expect(rowsOf(onShared)).toHaveLength(1);
  });

  it('does not bring the files back when the transaction is restored', async () => {
    await attached(onShared);
    const deleted = await remove({ as: OPERATOR }, onShared);
    expect(deleted.status).toBe(200);

    const restored = await call(
      'post',
      '/transactions/restore',
      { as: OPERATOR },
      deleted.body.snapshot
    );

    expect(restored.status).toBe(201);
    expect((await list({ as: OPERATOR }, onShared)).body.data).toEqual([]);
  });
});
