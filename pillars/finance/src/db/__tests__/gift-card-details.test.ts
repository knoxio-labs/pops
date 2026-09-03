/**
 * Invariant tests for the gift-card-details service against an in-memory
 * SQLite carrying the migrated finance schema — DB + service layer only
 * (POPS-2772).
 */
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import {
  AccountKindMismatchError,
  AccountNotFoundError,
  GiftCardDetailsNotFoundError,
  GiftCardEncryptionKeyMissingError,
} from '../errors.js';
import { giftCardSecretReveals } from '../schema.js';
import { createAccount } from '../services/accounts.js';
import {
  getGiftCardDetails,
  listExpiringGiftCards,
  revealGiftCardSecret,
  writeGiftCardDetails,
} from '../services/gift-card-details.js';
import { freshMigratedFinanceDb } from './migrated-db.js';

import type { FinanceDb } from '../services/internal.js';

const KEY = 'test-encryption-key';

function freshDb(): FinanceDb {
  return freshMigratedFinanceDb().db;
}

function makeGiftCardAccount(db: FinanceDb, name = 'Coles Gift Card') {
  return createAccount(db, { name, kind: 'gift-card', currency: 'AUD' });
}

describe('writeGiftCardDetails', () => {
  it('writes and round-trips a masked read (never the plaintext number/PIN)', () => {
    const db = freshDb();
    const account = makeGiftCardAccount(db);

    const written = writeGiftCardDetails(db, account.id, KEY, {
      number: '4111111111111234',
      pin: '4321',
      expiresOn: '2027-01-01',
      issuerEntityId: null,
    });

    expect(written.lastFour).toBe('1234');
    expect(written.expiresOn).toBe('2027-01-01');
    expect(written).not.toHaveProperty('number');
    expect(written).not.toHaveProperty('pin');

    const read = getGiftCardDetails(db, account.id);
    expect(read.lastFour).toBe('1234');
    expect(read.secretRef).not.toContain('4111111111111234');
  });

  it('replaces an existing row on a second write', () => {
    const db = freshDb();
    const account = makeGiftCardAccount(db);

    writeGiftCardDetails(db, account.id, KEY, { number: '1111111111111111', pin: '0000' });
    const second = writeGiftCardDetails(db, account.id, KEY, {
      number: '2222222222222222',
      pin: '9999',
    });

    expect(second.lastFour).toBe('2222');
    const revealed = revealGiftCardSecret(db, account.id, KEY);
    expect(revealed).toEqual({ number: '2222222222222222', pin: '9999' });
  });

  it('throws AccountNotFoundError for a missing account', () => {
    const db = freshDb();
    expect(() =>
      writeGiftCardDetails(db, 'does-not-exist', KEY, { number: '1234', pin: '0000' })
    ).toThrow(AccountNotFoundError);
  });

  it('throws AccountKindMismatchError for a non-gift-card account', () => {
    const db = freshDb();
    const cashAccount = createAccount(db, { name: 'Wallet', kind: 'cash', currency: 'AUD' });

    expect(() =>
      writeGiftCardDetails(db, cashAccount.id, KEY, { number: '1234', pin: '0000' })
    ).toThrow(AccountKindMismatchError);
  });

  it('throws GiftCardEncryptionKeyMissingError rather than storing the secret in the clear', () => {
    const db = freshDb();
    const account = makeGiftCardAccount(db);

    expect(() =>
      writeGiftCardDetails(db, account.id, undefined, { number: '1234567890123456', pin: '1234' })
    ).toThrow(GiftCardEncryptionKeyMissingError);

    // Nothing was persisted — a failed write must not leave a plaintext row.
    expect(() => getGiftCardDetails(db, account.id)).toThrow(GiftCardDetailsNotFoundError);
  });
});

describe('getGiftCardDetails', () => {
  it('throws GiftCardDetailsNotFoundError when the account is gift-card but has no details yet', () => {
    const db = freshDb();
    const account = makeGiftCardAccount(db);

    expect(() => getGiftCardDetails(db, account.id)).toThrow(GiftCardDetailsNotFoundError);
  });

  it('throws AccountKindMismatchError against a non-gift-card account even with no details row', () => {
    const db = freshDb();
    const cashAccount = createAccount(db, { name: 'Wallet 2', kind: 'cash', currency: 'AUD' });

    expect(() => getGiftCardDetails(db, cashAccount.id)).toThrow(AccountKindMismatchError);
  });
});

describe('revealGiftCardSecret', () => {
  it('decrypts the plaintext and records an audit row', () => {
    const db = freshDb();
    const account = makeGiftCardAccount(db);
    writeGiftCardDetails(db, account.id, KEY, { number: '4111111111111234', pin: '4321' });

    const beforeCount = db
      .select()
      .from(giftCardSecretReveals)
      .where(eq(giftCardSecretReveals.accountId, account.id))
      .all().length;
    expect(beforeCount).toBe(0);

    const revealed = revealGiftCardSecret(db, account.id, KEY);
    expect(revealed).toEqual({ number: '4111111111111234', pin: '4321' });

    const reveals = db
      .select()
      .from(giftCardSecretReveals)
      .where(eq(giftCardSecretReveals.accountId, account.id))
      .all();
    expect(reveals).toHaveLength(1);
    expect(reveals[0]?.revealedAt).toEqual(expect.any(String));
  });

  it('throws GiftCardEncryptionKeyMissingError when no key is configured', () => {
    const db = freshDb();
    const account = makeGiftCardAccount(db);
    writeGiftCardDetails(db, account.id, KEY, { number: '4111111111111234', pin: '4321' });

    expect(() => revealGiftCardSecret(db, account.id, undefined)).toThrow(
      GiftCardEncryptionKeyMissingError
    );
  });

  it('fails against a wrong key rather than returning garbage', () => {
    const db = freshDb();
    const account = makeGiftCardAccount(db);
    writeGiftCardDetails(db, account.id, KEY, { number: '4111111111111234', pin: '4321' });

    expect(() => revealGiftCardSecret(db, account.id, 'wrong-key')).toThrow();
  });
});

describe('listExpiringGiftCards', () => {
  it('lists a gift-card account expiring within the window', () => {
    const db = freshDb();
    const soon = makeGiftCardAccount(db, 'Expiring Soon');
    const inTenDays = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeGiftCardDetails(db, soon.id, KEY, {
      number: '1111222233334444',
      pin: '1111',
      expiresOn: inTenDays,
    });

    const results = listExpiringGiftCards(db, 30);
    expect(results.map((r) => r.accountId)).toContain(soon.id);
  });

  it('excludes a gift card expiring outside the window', () => {
    const db = freshDb();
    const later = makeGiftCardAccount(db, 'Expiring Later');
    const inOneYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    writeGiftCardDetails(db, later.id, KEY, {
      number: '5555666677778888',
      pin: '2222',
      expiresOn: inOneYear,
    });

    const results = listExpiringGiftCards(db, 30);
    expect(results.map((r) => r.accountId)).not.toContain(later.id);
  });

  it('excludes a gift card with no expiry set', () => {
    const db = freshDb();
    const noExpiry = makeGiftCardAccount(db, 'No Expiry');
    writeGiftCardDetails(db, noExpiry.id, KEY, { number: '9999888877776666', pin: '3333' });

    const results = listExpiringGiftCards(db, 30);
    expect(results.map((r) => r.accountId)).not.toContain(noExpiry.id);
  });
});
