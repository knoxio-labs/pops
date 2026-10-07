/**
 * The `/mobile/finance` routes that write a transaction, read its history and
 * reach its attached files.
 *
 * Driven through the real app, the real perimeter and the real SDK against a
 * finance stand-in on a socket. What a guest may do is finance's decision, so
 * the stand-in makes it and these tests check that bfm adds nothing to it and
 * loses nothing from it on the way back.
 *
 * The keys and addresses are throwaway literals.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '@pops/pillar-sdk/client';
import { __resetServerPillarCache, __resetServerSdkConfig } from '@pops/pillar-sdk/server';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  GUEST_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
  type MobileCapability,
} from '../../contract/capabilities.js';
import {
  MobileAccountHistoryPageSchema,
  MobileFinanceForbiddenErrorSchema,
  MobileFinanceReceiptExtractSchema,
  MobileFinanceRequestErrorSchema,
  MobileTransactionAttachmentsSchema,
  MobileTransactionHistorySchema,
} from '../../contract/mobile-finance-write-schemas.js';
import {
  MOBILE_UPLOAD_MAX_BYTES,
  MobileReceiptBytesSchema,
  MobileTransactionDetailSchema,
  MobileUpstreamErrorSchema,
} from '../../contract/rest-schemas.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createMobileFinanceClient } from '../finance/client.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { configureBfmServerSdk } from '../pillars/sdk-config.js';
import { financeAccountRow, financeRow } from './finance-fake.js';
import { startFinanceHttpFake, type FinanceHttpFake } from './finance-http-fake.js';
import { createTestApp, type TestApp } from './harness.js';
import { requestOn } from './test-http.js';

const SERVICE_ACCOUNT_KEY = 'pops_sa_TESTTEST.testsecret_not_a_real_key_000000';
const EDITOR = 'rosane@example.com';
const VIEWER = 'viewer@example.com';

const SHARED = financeAccountRow({ id: 'acc-shared', name: 'Rosane', kind: 'person' });
const YEN = financeAccountRow({ id: 'acc-yen', name: 'Tokyo cash', kind: 'cash', currency: 'JPY' });
const PRIVATE = financeAccountRow({ id: 'acc-private', name: 'Up Everyday' });

const RECEIPT_URI = `pops://purchases/receipt/${'a'.repeat(64)}`;
const PART = { mediaType: 'image/jpeg', dataBase64: 'AAEC' };

const TRANSACTIONS = '/mobile/finance/transactions';
const NEW_ENTRY = {
  accountId: SHARED.id,
  description: 'Farmácia',
  amountMinorUnits: -1999,
  date: '2026-10-07',
  type: 'purchase',
};

let finance: FinanceHttpFake;
let app: TestApp;

function resetSdk(): void {
  __resetServerSdkConfig();
  __resetServerPillarCache();
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
}

beforeEach(async () => {
  resetSdk();
  finance = await startFinanceHttpFake({
    accounts: [SHARED, YEN, PRIVATE],
    transactions: [
      financeRow({ id: 'txn-shared', accountId: SHARED.id, amount: -12.5, date: '2026-10-02' }),
      financeRow({ id: 'txn-private', accountId: PRIVATE.id, date: '2026-10-01' }),
    ],
  });
  finance.grant(EDITOR, SHARED.id, 'edit');
  finance.grant(EDITOR, YEN.id, 'edit');
  finance.grant(VIEWER, SHARED.id, 'view');
  configureBfmServerSdk({
    POPS_INTERNAL_API_KEY: SERVICE_ACCOUNT_KEY,
    POPS_REGISTRY_URL: finance.baseUrl,
  });
  app = createTestApp({ finance: createMobileFinanceClient(createPillarGateway()) });
});

afterEach(async () => {
  app.cleanup();
  resetSdk();
  await finance.close();
});

interface Device {
  authorization: string;
}

function pair(overrides: Parameters<typeof deviceRow>[0]): Device {
  const row = deviceRow(overrides);
  app.db.insert(devices).values(row).run();
  return { authorization: `Bearer ${mintAccessToken(row.id, app.accessTokenSigningKey).token}` };
}

const operatorDevice = (): Device => pair({ capabilityMode: 'tracks-default' });

function guestDevice(email: string): Device {
  return pair({
    subjectEmail: email,
    capabilities: serialiseDeviceCapabilities(GUEST_DEVICE_CAPABILITIES),
  });
}

function deviceWithout(capability: MobileCapability): Device {
  return pair({
    capabilities: serialiseDeviceCapabilities(
      DEFAULT_DEVICE_CAPABILITIES.filter((granted) => granted !== capability)
    ),
  });
}

function get(device: Device, path: string) {
  return requestOn(app.app, (r) => r.get(path).set('Authorization', device.authorization));
}

function post(device: Device, path: string, body: unknown) {
  return requestOn(app.app, (r) =>
    r
      .post(path)
      .set('Authorization', device.authorization)
      .send(body as object)
  );
}

function patch(device: Device, path: string, body: unknown) {
  return requestOn(app.app, (r) =>
    r
      .patch(path)
      .set('Authorization', device.authorization)
      .send(body as object)
  );
}

function subjectsSent(): (string | string[] | undefined)[] {
  return finance.calls.map((call) => call.subject);
}

function seedAttachment(mediaType: string): string {
  const id = `att-seed-${String(finance.state.attachments.length + 1)}`;
  finance.state.attachments.push({
    id,
    transactionId: 'txn-shared',
    documentUri: RECEIPT_URI,
    mediaType,
    position: finance.state.attachments.length,
    createdAt: '2026-10-08T00:00:00.000Z',
    createdBy: EDITOR,
  });
  return id;
}

describe('the capability', () => {
  it('reaches a guest device and an operator device tracking the default grant', () => {
    expect(GUEST_DEVICE_CAPABILITIES).toContain('finance.transactions.write');
    expect(DEFAULT_DEVICE_CAPABILITIES).toContain('finance.transactions.write');
  });

  it.each([
    ['create', () => post(deviceWithout('finance.transactions.write'), TRANSACTIONS, NEW_ENTRY)],
    [
      'update',
      () =>
        patch(deviceWithout('finance.transactions.write'), `${TRANSACTIONS}/txn-shared`, {
          notes: 'x',
        }),
    ],
    [
      'receipt-extract',
      () =>
        post(deviceWithout('finance.transactions.write'), `${TRANSACTIONS}/receipt-extract`, {
          accountId: SHARED.id,
          parts: [PART],
        }),
    ],
    [
      'attach',
      () =>
        post(
          deviceWithout('finance.transactions.write'),
          `${TRANSACTIONS}/txn-shared/attachments`,
          { parts: [PART] }
        ),
    ],
  ])('refuses %s with 403 before finance is called', async (_name, call) => {
    const res = await call();

    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({
      code: 'capability_not_granted',
      capability: 'finance.transactions.write',
    });
    expect(finance.calls).toEqual([]);
  });

  it.each([
    `${TRANSACTIONS}/txn-shared/history`,
    `/mobile/finance/accounts/${SHARED.id}/history`,
    `${TRANSACTIONS}/txn-shared/attachments`,
    `${TRANSACTIONS}/txn-shared/attachments/att-1`,
    `${TRANSACTIONS}/txn-shared/attachments/att-1/thumbnail`,
  ])('refuses GET %s without the read capability, before finance is called', async (path) => {
    const res = await get(deviceWithout('finance.transactions.read'), path);

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('finance.transactions.read');
    expect(finance.calls).toEqual([]);
  });

  it('lets a device with read and no write read history and attachments', async () => {
    const device = deviceWithout('finance.transactions.write');

    const history = await get(device, `${TRANSACTIONS}/txn-shared/history`);
    const files = await get(device, `${TRANSACTIONS}/txn-shared/attachments`);

    expect(history.status).toBe(200);
    expect(files.status).toBe(200);
  });

  it('exposes no way to delete or restore a transaction or remove an attachment', async () => {
    const device = operatorDevice();
    const attachmentId = seedAttachment('image/jpeg');

    const removed = await requestOn(app.app, (r) =>
      r.delete(`${TRANSACTIONS}/txn-shared`).set('Authorization', device.authorization)
    );
    const restored = await post(device, `${TRANSACTIONS}/restore`, { id: 'txn-shared' });
    const detached = await requestOn(app.app, (r) =>
      r
        .delete(`${TRANSACTIONS}/txn-shared/attachments/${attachmentId}`)
        .set('Authorization', device.authorization)
    );

    expect([removed.status, restored.status, detached.status]).toEqual([404, 404, 404]);
    expect(finance.calls).toEqual([]);
    expect(finance.state.transactions.map((row) => row.id)).toContain('txn-shared');
  });
});

describe('creating a transaction', () => {
  it('writes it for a guest with edit, as that guest, in the account currency', async () => {
    const res = await post(guestDevice(EDITOR), TRANSACTIONS, NEW_ENTRY);

    expect(res.status).toBe(200);
    const created = MobileTransactionDetailSchema.parse(res.body);
    expect(created).toMatchObject({
      description: 'Farmácia',
      amountMinorUnits: -1999,
      currency: 'AUD',
      account: 'Rosane',
      date: '2026-10-07',
      type: 'purchase',
    });
    expect(finance.writes).toEqual([
      {
        method: 'POST',
        path: '/transactions',
        body: {
          accountId: SHARED.id,
          description: 'Farmácia',
          amount: -19.99,
          date: '2026-10-07',
          type: 'purchase',
        },
      },
    ]);
    expect(subjectsSent()).toEqual([EDITOR, EDITOR]);
  });

  it('writes it for an operator device with no subject, tags and entity included', async () => {
    const res = await post(operatorDevice(), TRANSACTIONS, {
      ...NEW_ENTRY,
      accountId: PRIVATE.id,
      tags: ['health'],
      entityId: 'ent-9',
      entityName: 'Chemist',
      notes: 'paid in cash',
    });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      tags: ['health'],
      entityName: 'Chemist',
      account: PRIVATE.name,
    });
    expect(finance.writes[0]?.body).toMatchObject({
      tags: ['health'],
      entityId: 'ent-9',
      notes: 'paid in cash',
    });
    expect(subjectsSent()).toEqual([undefined, undefined]);
  });

  it('sends a whole-unit amount for a currency with no minor unit', async () => {
    const res = await post(guestDevice(EDITOR), TRANSACTIONS, {
      ...NEW_ENTRY,
      accountId: YEN.id,
      amountMinorUnits: -1500,
    });

    expect(res.status).toBe(200);
    expect(finance.writes[0]?.body).toMatchObject({ amount: -1500 });
    expect(res.body).toMatchObject({ amountMinorUnits: -1500, currency: 'JPY' });
  });

  it('relays 403 for a guest with view, with finance’s own code, and writes nothing', async () => {
    const res = await post(guestDevice(VIEWER), TRANSACTIONS, NEW_ENTRY);

    expect(res.status).toBe(403);
    const body = MobileFinanceForbiddenErrorSchema.parse(res.body);
    expect(body.code).toBe('finance.resource.forbidden');
    expect(body.retryable).toBe(false);
    expect(body.details).toMatchObject({ upstream: { pillar: 'finance', status: 403 } });
    expect(finance.state.transactions).toHaveLength(2);
  });

  it('answers 404 for an account the guest was not granted, like one that does not exist', async () => {
    const ungranted = await post(guestDevice(EDITOR), TRANSACTIONS, {
      ...NEW_ENTRY,
      accountId: PRIVATE.id,
    });
    const missing = await post(guestDevice(EDITOR), TRANSACTIONS, {
      ...NEW_ENTRY,
      accountId: 'acc-nope',
    });

    expect(ungranted.status).toBe(404);
    expect(missing.status).toBe(404);
    expect(MobileUpstreamErrorSchema.parse(ungranted.body).code).toBe('finance.resource.not_found');
    expect(ungranted.body.details.upstream).toEqual(missing.body.details.upstream);
    expect(finance.writes).toEqual([]);
    expect(finance.state.transactions).toHaveLength(2);
  });

  it('relays finance’s 400 when a guest sets a field only the operator may', async () => {
    const res = await post(guestDevice(EDITOR), TRANSACTIONS, { ...NEW_ENTRY, tags: ['health'] });

    expect(res.status).toBe(400);
    const body = MobileFinanceRequestErrorSchema.parse(res.body);
    expect(body.code).toBe('finance.request.invalid');
    expect(body.details).toMatchObject({
      fields: ['tags'],
      upstream: { pillar: 'finance', status: 400 },
    });
  });

  it('relays finance’s 400 for a type finance does not know, which bfm does not judge', async () => {
    const res = await post(operatorDevice(), TRANSACTIONS, { ...NEW_ENTRY, type: 'barter' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('finance.request.invalid');
    expect(finance.writes).toHaveLength(1);
  });

  it.each([
    ['a fractional amount', { ...NEW_ENTRY, amountMinorUnits: -19.99 }],
    ['a date that is not date-only', { ...NEW_ENTRY, date: '2026-10-07T10:00:00Z' }],
    ['a missing description', { ...NEW_ENTRY, description: undefined }],
    ['a field the route does not take', { ...NEW_ENTRY, relatedTransactionId: 'txn-private' }],
    ['an import checksum', { ...NEW_ENTRY, checksum: 'abc' }],
  ])('refuses %s itself with 400 and never calls finance', async (_name, body) => {
    const res = await post(operatorDevice(), TRANSACTIONS, body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bfm.request.invalid');
    expect(finance.calls).toEqual([]);
  });

  it('answers a retryable 503 when finance is down', async () => {
    finance.setOutage(true);

    const res = await post(guestDevice(EDITOR), TRANSACTIONS, NEW_ENTRY);

    expect(res.status).toBe(503);
    const body = MobileUpstreamErrorSchema.parse(res.body);
    expect(body.retryable).toBe(true);
    expect(body.details.upstream).toEqual({ pillar: 'finance', status: 503 });
  });

  it.each([
    [409, 'finance.resource.conflict', 502],
    [422, 'finance.resource.unprocessable', 400],
    [401, 'finance.auth.invalid', 502],
    [403, 'finance.auth.forbidden', 502],
    [500, 'finance.internal', 503],
  ])('maps a finance %i (%s) to %i', async (status, code, expected) => {
    finance.state.forced = { status, code };

    const res = await post(operatorDevice(), TRANSACTIONS, NEW_ENTRY);

    expect(res.status).toBe(expected);
    if (expected !== 503) expect(res.body.code).toBe(code);
    expect(res.body.details.upstream.pillar).toBe('finance');
  });
});

describe('editing a transaction', () => {
  const path = `${TRANSACTIONS}/txn-shared`;

  it('changes only the fields sent, for a guest with edit', async () => {
    const res = await patch(guestDevice(EDITOR), path, { notes: 'split with Joao' });

    expect(res.status).toBe(200);
    expect(MobileTransactionDetailSchema.parse(res.body)).toMatchObject({
      id: 'txn-shared',
      notes: 'split with Joao',
      amountMinorUnits: -1250,
      account: 'Rosane',
    });
    expect(finance.writes).toEqual([
      { method: 'PATCH', path: '/transactions/txn-shared', body: { notes: 'split with Joao' } },
    ]);
    // The write, then one account lookup to name the account in the answer.
    expect(subjectsSent()).toEqual([EDITOR, EDITOR]);
  });

  it('converts a new amount in the currency of the account the transaction sits on', async () => {
    const res = await patch(guestDevice(EDITOR), path, { amountMinorUnits: -3050 });

    expect(res.status).toBe(200);
    expect(finance.writes[0]?.body).toEqual({ amount: -30.5 });
    expect(res.body.amountMinorUnits).toBe(-3050);
  });

  it('converts a new amount in the currency of the account it is moved to', async () => {
    const res = await patch(guestDevice(EDITOR), path, {
      accountId: YEN.id,
      amountMinorUnits: -900,
    });

    expect(res.status).toBe(200);
    expect(finance.writes[0]?.body).toEqual({ accountId: YEN.id, amount: -900 });
    expect(res.body).toMatchObject({ currency: 'JPY', amountMinorUnits: -900, account: YEN.name });
  });

  it('clears a nullable field when sent null', async () => {
    finance.state.transactions[0] = financeRow({
      id: 'txn-shared',
      accountId: SHARED.id,
      notes: 'old',
    });

    const res = await patch(operatorDevice(), path, { notes: null });

    expect(res.status).toBe(200);
    expect(res.body.notes).toBeNull();
    expect(finance.writes[0]?.body).toEqual({ notes: null });
  });

  it('relays 403 for a guest with view and leaves the transaction as it was', async () => {
    const res = await patch(guestDevice(VIEWER), path, { amountMinorUnits: -1 });

    expect(res.status).toBe(403);
    expect(MobileFinanceForbiddenErrorSchema.parse(res.body).code).toBe(
      'finance.resource.forbidden'
    );
    expect(finance.state.transactions[0]?.amount).toBe(-12.5);
  });

  it('answers 404 for a transaction on an account the guest was not granted', async () => {
    const withAmount = await patch(guestDevice(EDITOR), `${TRANSACTIONS}/txn-private`, {
      amountMinorUnits: -1,
    });
    const withoutAmount = await patch(guestDevice(EDITOR), `${TRANSACTIONS}/txn-private`, {
      notes: 'x',
    });
    const missing = await patch(guestDevice(EDITOR), `${TRANSACTIONS}/txn-nope`, { notes: 'x' });

    expect([withAmount.status, withoutAmount.status, missing.status]).toEqual([404, 404, 404]);
    expect(finance.state.transactions[1]).toMatchObject({ id: 'txn-private', notes: null });
  });

  it('answers 404 when a guest moves a transaction to an account it was not granted', async () => {
    const res = await patch(guestDevice(EDITOR), path, {
      accountId: PRIVATE.id,
      amountMinorUnits: -100,
    });

    expect(res.status).toBe(404);
    expect(finance.state.transactions[0]?.accountId).toBe(SHARED.id);
  });

  it('relays finance’s 400 when a guest clears the operator’s tags', async () => {
    const res = await patch(guestDevice(EDITOR), path, { tags: [] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('finance.request.invalid');
  });

  it('refuses a fractional amount itself and never calls finance', async () => {
    const res = await patch(operatorDevice(), path, { amountMinorUnits: 0.5 });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bfm.request.invalid');
    expect(finance.calls).toEqual([]);
  });

  it('answers 503 when finance is down', async () => {
    finance.setOutage(true);

    const res = await patch(operatorDevice(), path, { amountMinorUnits: -5 });

    expect(res.status).toBe(503);
    expect(res.body.retryable).toBe(true);
  });
});

describe('reading history', () => {
  it('shows a transaction’s changes in minor units, newest first, to a guest with view', async () => {
    const editor = guestDevice(EDITOR);
    await patch(editor, `${TRANSACTIONS}/txn-shared`, { amountMinorUnits: -3050 });
    await patch(editor, `${TRANSACTIONS}/txn-shared`, { notes: 'later' });

    const res = await get(guestDevice(VIEWER), `${TRANSACTIONS}/txn-shared/history`);

    expect(res.status).toBe(200);
    const { data } = MobileTransactionHistorySchema.parse(res.body);
    expect(data.map((event) => event.changed)).toEqual([['notes'], ['amountMinorUnits']]);
    expect(data[1]).toMatchObject({
      action: 'update',
      actorKind: 'guest',
      actorEmail: EDITOR,
      before: { amountMinorUnits: -1250, currency: 'AUD' },
      after: { amountMinorUnits: -3050, currency: 'AUD' },
    });
  });

  it('reports each side of a move in its own account’s currency', async () => {
    await patch(operatorDevice(), `${TRANSACTIONS}/txn-shared`, {
      accountId: YEN.id,
      amountMinorUnits: -900,
    });

    const res = await get(operatorDevice(), `${TRANSACTIONS}/txn-shared/history`);

    const [event] = MobileTransactionHistorySchema.parse(res.body).data;
    expect(event?.before).toMatchObject({ amountMinorUnits: -1250, currency: 'AUD' });
    expect(event?.after).toMatchObject({ amountMinorUnits: -900, currency: 'JPY' });
  });

  it('answers an empty history for a transaction nothing has changed', async () => {
    const res = await get(operatorDevice(), `${TRANSACTIONS}/txn-shared/history`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ data: [] });
  });

  it('answers 404 for a transaction or account the guest was not granted', async () => {
    const transaction = await get(guestDevice(VIEWER), `${TRANSACTIONS}/txn-private/history`);
    const account = await get(
      guestDevice(VIEWER),
      `/mobile/finance/accounts/${PRIVATE.id}/history`
    );

    expect(transaction.status).toBe(404);
    expect(account.status).toBe(404);
    expect(MobileUpstreamErrorSchema.parse(account.body).code).toBe('finance.resource.not_found');
  });

  it('pages an account’s history with an opaque cursor until it runs out', async () => {
    const device = operatorDevice();
    for (const notes of ['one', 'two', 'three']) {
      await patch(device, `${TRANSACTIONS}/txn-shared`, { notes });
    }
    const path = `/mobile/finance/accounts/${SHARED.id}/history`;

    const first = MobileAccountHistoryPageSchema.parse((await get(device, `${path}?limit=2`)).body);
    const second = MobileAccountHistoryPageSchema.parse(
      (await get(device, `${path}?limit=2&cursor=${String(first.nextCursor)}`)).body
    );

    expect(first.data.map((event) => event.after?.notes)).toEqual(['three', 'two']);
    expect(first.nextCursor).not.toBeNull();
    expect(second.data.map((event) => event.after?.notes)).toEqual(['one']);
    expect(second.nextCursor).toBeNull();
  });

  it.each(['not-a-cursor', Buffer.from('{"o":-1}').toString('base64url')])(
    'refuses the cursor %s with invalid_cursor and never calls finance',
    async (cursor) => {
      const res = await get(
        operatorDevice(),
        `/mobile/finance/accounts/${SHARED.id}/history?cursor=${cursor}`
      );

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('invalid_cursor');
      expect(finance.calls).toEqual([]);
    }
  );

  it('answers 503 when finance is down, not an empty history', async () => {
    finance.setOutage(true);

    const res = await get(operatorDevice(), `${TRANSACTIONS}/txn-shared/history`);

    expect(res.status).toBe(503);
    expect(res.body.data).toBeUndefined();
  });
});

describe('reading a receipt into a suggestion', () => {
  const path = `${TRANSACTIONS}/receipt-extract`;
  const body = { accountId: SHARED.id, parts: [PART] };

  it('returns the suggestion in minor units with the stored files, for a guest with edit', async () => {
    finance.state.extractAnswer = {
      outcome: 'suggested',
      receiptUris: [RECEIPT_URI],
      suggestion: {
        date: '2026-10-06',
        description: 'Padaria',
        amountCents: -2340,
        currency: 'BRL',
        currencyMismatch: true,
      },
    };

    const res = await post(guestDevice(EDITOR), path, body);

    expect(res.status).toBe(200);
    expect(MobileFinanceReceiptExtractSchema.parse(res.body)).toEqual({
      outcome: 'suggested',
      receiptUris: [RECEIPT_URI],
      suggestion: {
        date: '2026-10-06',
        description: 'Padaria',
        amountMinorUnits: -2340,
        currency: 'BRL',
        currencyMismatch: true,
      },
    });
    expect(finance.writes).toEqual([
      { method: 'POST', path: '/transactions/receipt-extract', body },
    ]);
    expect(subjectsSent()).toEqual([EDITOR]);
    expect(finance.state.transactions).toHaveLength(2);
  });

  it.each(['unreadable', 'unavailable', 'already-a-purchase', 'an-outcome-added-later'])(
    'passes the outcome %s through with the stored files and no suggestion',
    async (outcome) => {
      finance.state.extractAnswer = { outcome, receiptUris: [RECEIPT_URI] };

      const res = await post(operatorDevice(), path, body);

      expect(res.status).toBe(200);
      expect(res.body).toEqual({ outcome, receiptUris: [RECEIPT_URI], suggestion: null });
    }
  );

  it('relays 403 for a guest with view and 404 for an account it was not granted', async () => {
    const viewer = await post(guestDevice(VIEWER), path, body);
    const ungranted = await post(guestDevice(EDITOR), path, { ...body, accountId: PRIVATE.id });

    expect(viewer.status).toBe(403);
    expect(viewer.body.code).toBe('finance.resource.forbidden');
    expect(ungranted.status).toBe(404);
  });

  it('refuses a media type the mobile surface does not take, before finance is called', async () => {
    const res = await post(operatorDevice(), path, {
      accountId: SHARED.id,
      parts: [{ mediaType: 'application/zip', dataBase64: 'AAEC' }],
    });

    expect(res.status).toBe(400);
    expect(finance.calls).toEqual([]);
  });

  it('refuses a body over the mobile upload limit with 413, before finance is called', async () => {
    const res = await post(operatorDevice(), path, {
      accountId: SHARED.id,
      parts: [{ mediaType: 'image/jpeg', dataBase64: 'A'.repeat(MOBILE_UPLOAD_MAX_BYTES) }],
    });

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      code: 'payload_too_large',
      maxBytes: MOBILE_UPLOAD_MAX_BYTES,
    });
    expect(finance.calls).toEqual([]);
  });

  it('accepts a body past the default parser limit and under the upload limit', async () => {
    const large = { mediaType: 'image/jpeg', dataBase64: 'A'.repeat(512 * 1024) };

    const res = await post(operatorDevice(), path, { accountId: SHARED.id, parts: [large] });

    expect(res.status).toBe(200);
    expect(finance.writes).toHaveLength(1);
  });

  it('answers 503 when finance cannot reach the receipt store', async () => {
    finance.state.forced = { status: 503, code: 'finance.dependency.unavailable' };

    const res = await post(operatorDevice(), path, body);

    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'finance.dependency.unavailable', retryable: true });
  });
});

describe('attaching files', () => {
  const path = `${TRANSACTIONS}/txn-shared/attachments`;

  it('attaches new files for a guest with edit and answers them without the store’s URI', async () => {
    const res = await post(guestDevice(EDITOR), path, { parts: [PART] });

    expect(res.status).toBe(200);
    const { data } = MobileTransactionAttachmentsSchema.parse(res.body);
    expect(data).toEqual([
      {
        id: 'att-1',
        transactionId: 'txn-shared',
        mediaType: 'image/jpeg',
        position: 0,
        createdAt: '2026-10-08T00:00:00.000Z',
        createdBy: EDITOR,
      },
    ]);
    expect(res.body.data[0].documentUri).toBeUndefined();
    expect(finance.writes).toEqual([
      { method: 'POST', path: '/transactions/txn-shared/attachments', body: { parts: [PART] } },
    ]);
  });

  it('attaches files the receipt store already holds, by URI', async () => {
    const res = await post(operatorDevice(), path, { receiptUris: [RECEIPT_URI] });

    expect(res.status).toBe(200);
    expect(finance.writes[0]?.body).toEqual({ receiptUris: [RECEIPT_URI] });
    expect(finance.state.attachments[0]?.documentUri).toBe(RECEIPT_URI);
  });

  it.each([
    ['both parts and receiptUris', { parts: [PART], receiptUris: [RECEIPT_URI] }],
    ['neither', {}],
    ['an empty parts list', { parts: [] }],
    ['a URI that is not a receipt URI', { receiptUris: ['https://example.com/a.jpg'] }],
    [
      'more URIs than one call takes',
      { receiptUris: Array.from({ length: 101 }, () => RECEIPT_URI) },
    ],
  ])('refuses %s itself with 400 and never calls finance', async (_name, body) => {
    const res = await post(operatorDevice(), path, body);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('bfm.request.invalid');
    expect(finance.calls).toEqual([]);
  });

  it('takes the most URIs one call allows', async () => {
    const res = await post(operatorDevice(), path, {
      receiptUris: Array.from({ length: 100 }, () => RECEIPT_URI),
    });

    expect(res.status).toBe(200);
  });

  it('relays 403 for a guest with view and 404 for a transaction it was not granted', async () => {
    const viewer = await post(guestDevice(VIEWER), path, { parts: [PART] });
    const ungranted = await post(guestDevice(EDITOR), `${TRANSACTIONS}/txn-private/attachments`, {
      parts: [PART],
    });

    expect(viewer.status).toBe(403);
    expect(viewer.body.code).toBe('finance.resource.forbidden');
    expect(ungranted.status).toBe(404);
    expect(finance.state.attachments).toEqual([]);
  });

  it('refuses a body over the mobile upload limit with 413, before finance is called', async () => {
    const res = await post(operatorDevice(), path, {
      parts: [{ mediaType: 'image/jpeg', dataBase64: 'A'.repeat(MOBILE_UPLOAD_MAX_BYTES) }],
    });

    expect(res.status).toBe(413);
    expect(res.body).toMatchObject({
      code: 'payload_too_large',
      maxBytes: MOBILE_UPLOAD_MAX_BYTES,
    });
    expect(finance.calls).toEqual([]);
  });

  it('relays finance’s 400 for a file the receipt store rejects', async () => {
    finance.state.forced = { status: 400, code: 'finance.request.invalid' };

    const res = await post(operatorDevice(), path, { parts: [PART] });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('finance.request.invalid');
  });

  it('answers 503 when the receipt store is out of reach', async () => {
    finance.state.forced = { status: 503, code: 'finance.dependency.unavailable' };

    const res = await post(operatorDevice(), path, { parts: [PART] });

    expect(res.status).toBe(503);
    expect(res.body.retryable).toBe(true);
  });
});

describe('reading attachments', () => {
  const path = `${TRANSACTIONS}/txn-shared/attachments`;

  it('lists them and serves the bytes and a thumbnail to a guest with view', async () => {
    const id = seedAttachment('image/jpeg');
    const viewer = guestDevice(VIEWER);

    const list = await get(viewer, path);
    const full = await get(viewer, `${path}/${id}`);
    const thumbnail = await get(viewer, `${path}/${id}/thumbnail`);

    expect(MobileTransactionAttachmentsSchema.parse(list.body).data.map((file) => file.id)).toEqual(
      [id]
    );
    expect(full.status).toBe(200);
    expect(MobileReceiptBytesSchema.parse(full.body)).toMatchObject({
      mediaType: 'image/jpeg',
      byteLength: 3,
      dataBase64: 'AAEC',
    });
    expect(thumbnail.status).toBe(200);
    expect(subjectsSent()).toEqual([VIEWER, VIEWER, VIEWER]);
  });

  it('answers 415 for the thumbnail of a file that is not a picture, and still serves the file', async () => {
    const id = seedAttachment('application/pdf');

    const thumbnail = await get(operatorDevice(), `${path}/${id}/thumbnail`);
    const full = await get(operatorDevice(), `${path}/${id}`);

    expect(thumbnail.status).toBe(415);
    expect(MobileUpstreamErrorSchema.parse(thumbnail.body).code).toBe(
      'finance.resource.unsupported_media_type'
    );
    expect(full.status).toBe(200);
  });

  it('answers 404 for an attachment id the transaction does not hold', async () => {
    const res = await get(operatorDevice(), `${path}/att-nope`);

    expect(res.status).toBe(404);
  });

  it('answers 404 on every read for a transaction the guest was not granted', async () => {
    const guest = guestDevice(EDITOR);
    const hidden = `${TRANSACTIONS}/txn-private/attachments`;

    const responses = await Promise.all([
      get(guest, hidden),
      get(guest, `${hidden}/att-1`),
      get(guest, `${hidden}/att-1/thumbnail`),
    ]);

    expect(responses.map((res) => res.status)).toEqual([404, 404, 404]);
  });

  it('answers 503 when finance is down, not an empty list', async () => {
    finance.setOutage(true);

    const res = await get(operatorDevice(), path);

    expect(res.status).toBe(503);
    expect(res.body.data).toBeUndefined();
  });
});

describe('the routes that existed before', () => {
  it('still serve the list and the detail to a guest and an operator', async () => {
    const guestList = await get(guestDevice(VIEWER), TRANSACTIONS);
    const operatorDetail = await get(operatorDevice(), `${TRANSACTIONS}/txn-private`);

    expect(guestList.status).toBe(200);
    expect(guestList.body.data.map((row: { id: string }) => row.id)).toEqual(['txn-shared']);
    expect(operatorDetail.status).toBe(200);
    expect(operatorDetail.body.id).toBe('txn-private');
  });

  it('still answer 502 for a role refusal on a route that declares no 403', async () => {
    finance.state.forced = { status: 403, code: 'finance.resource.forbidden' };

    const res = await get(guestDevice(VIEWER), `${TRANSACTIONS}/txn-shared/history`);

    expect(res.status).toBe(502);
    expect(MobileUpstreamErrorSchema.parse(res.body).code).toBe('finance.resource.forbidden');
  });
});
