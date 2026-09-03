/**
 * Integration tests for the `accounts/:id/gift-card-details.*` REST surface
 * (POPS-2772): masked read/write, the 422 kind-mismatch mapping, and the
 * one-shot reveal's audit trail.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { giftCardSecretReveals } from '../../db/schema.js';
import { createFinanceApiApp } from '../app.js';
import {
  GIFT_CARD_ENCRYPTION_KEY_ENV,
  GIFT_CARD_ENCRYPTION_KEY_FILE_ENV,
} from '../gift-card-encryption-key.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient, requestOn } from './test-utils.js';

let tmpDir: string;
let financeDb: OpenedFinanceDb;
let originalEncryptionKey: string | undefined;
let originalEncryptionKeyFile: string | undefined;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-gift-card-details-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
  originalEncryptionKey = process.env[GIFT_CARD_ENCRYPTION_KEY_ENV];
  originalEncryptionKeyFile = process.env[GIFT_CARD_ENCRYPTION_KEY_FILE_ENV];
  process.env[GIFT_CARD_ENCRYPTION_KEY_ENV] = 'integration-test-key';
  delete process.env[GIFT_CARD_ENCRYPTION_KEY_FILE_ENV];
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  if (originalEncryptionKey === undefined) delete process.env[GIFT_CARD_ENCRYPTION_KEY_ENV];
  else process.env[GIFT_CARD_ENCRYPTION_KEY_ENV] = originalEncryptionKey;
  if (originalEncryptionKeyFile === undefined)
    delete process.env[GIFT_CARD_ENCRYPTION_KEY_FILE_ENV];
  else process.env[GIFT_CARD_ENCRYPTION_KEY_FILE_ENV] = originalEncryptionKeyFile;
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

async function createGiftCardAccount(name = 'Coles Gift Card') {
  const created = await client().accounts.create({ name, kind: 'gift-card', currency: 'AUD' });
  return created.data.id;
}

describe('gift card details — happy paths', () => {
  it('writes and reads back a masked record, never the plaintext number/PIN on the wire', async () => {
    const accountId = await createGiftCardAccount();

    const written = await client().giftCardDetails.write(accountId, {
      number: '4111111111111234',
      pin: '4321',
      expiresOn: '2027-06-01',
    });
    expect(written.data).toMatchObject({
      accountId,
      lastFour: '1234',
      expiresOn: '2027-06-01',
    });
    expect(written.message).toBe('Gift card details saved');

    const raw = await requestOn(
      createFinanceApiApp({
        financeDb,
        version: '0.0.1-test',
        selfBaseUrl: 'http://localhost:3004',
        contacts: makeContactsFake(),
      }),
      (r) => r.get(`/accounts/${accountId}/gift-card-details`)
    );
    expect(raw.status).toBe(200);
    // Assert against the raw serialized body text, not just a typed field —
    // a masked read must never contain the plaintext number or PIN anywhere
    // in the wire response, typed or not.
    expect(raw.text).not.toContain('4111111111111234');
    expect(raw.text).not.toContain('4321');
    expect(JSON.parse(raw.text)).toMatchObject({ data: { accountId, lastFour: '1234' } });
  });

  it('replaces the details on a second write', async () => {
    const accountId = await createGiftCardAccount();
    await client().giftCardDetails.write(accountId, { number: '1111111111111111', pin: '0000' });
    const second = await client().giftCardDetails.write(accountId, {
      number: '2222222222222222',
      pin: '9999',
    });
    expect(second.data.lastFour).toBe('2222');
  });

  it('reveals the plaintext number/PIN once and records an audit row', async () => {
    const accountId = await createGiftCardAccount();
    await client().giftCardDetails.write(accountId, { number: '4111111111111234', pin: '4321' });

    const beforeReveals = financeDb.db
      .select()
      .from(giftCardSecretReveals)
      .where(eq(giftCardSecretReveals.accountId, accountId))
      .all();
    expect(beforeReveals).toHaveLength(0);

    const revealed = await client().giftCardDetails.reveal(accountId);
    expect(revealed.data).toEqual({ number: '4111111111111234', pin: '4321' });

    const afterReveals = financeDb.db
      .select()
      .from(giftCardSecretReveals)
      .where(eq(giftCardSecretReveals.accountId, accountId))
      .all();
    expect(afterReveals).toHaveLength(1);
    expect(afterReveals[0]?.accountId).toBe(accountId);
  });
});

describe('gift card details — error mapping', () => {
  it('422s a write against a non-gift-card account', async () => {
    const created = await client().accounts.create({
      name: 'Wallet',
      kind: 'cash',
      currency: 'AUD',
    });

    await expect(
      client().giftCardDetails.write(created.data.id, { number: '1234', pin: '0000' })
    ).rejects.toMatchObject({ status: 422 });
  });

  it('422s a masked read against a non-gift-card account', async () => {
    const created = await client().accounts.create({
      name: 'Wallet 2',
      kind: 'checking',
      currency: 'AUD',
    });

    await expect(client().giftCardDetails.get(created.data.id)).rejects.toMatchObject({
      status: 422,
    });
  });

  it('404s a masked read for a gift-card account with no details written yet', async () => {
    const accountId = await createGiftCardAccount();
    await expect(client().giftCardDetails.get(accountId)).rejects.toMatchObject({ status: 404 });
  });

  it('404s a write against a missing account', async () => {
    await expect(
      client().giftCardDetails.write('missing-id', { number: '1234', pin: '0000' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('400s a write with no number', async () => {
    const accountId = await createGiftCardAccount();
    await expect(client().giftCardDetails.write(accountId, { pin: '0000' })).rejects.toMatchObject({
      status: 400,
    });
  });

  it('500s a write with no encryption key configured, and stores nothing', async () => {
    delete process.env[GIFT_CARD_ENCRYPTION_KEY_ENV];
    delete process.env[GIFT_CARD_ENCRYPTION_KEY_FILE_ENV];
    const accountId = await createGiftCardAccount();

    await expect(
      client().giftCardDetails.write(accountId, { number: '4111111111111234', pin: '4321' })
    ).rejects.toMatchObject({ status: 500 });

    process.env[GIFT_CARD_ENCRYPTION_KEY_ENV] = 'integration-test-key';
    await expect(client().giftCardDetails.get(accountId)).rejects.toMatchObject({ status: 404 });
  });
});
