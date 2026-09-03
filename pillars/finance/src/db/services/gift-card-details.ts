/**
 * Gift-card account details: masked reads, one-shot plaintext reveal, and
 * write/replace of the encrypted number/PIN (POPS-2772).
 *
 * Only a `gift-card`-kind account may carry a row here. Enforced by checking
 * the account's live `kind` before every write and read, since
 * `accounts.kind` can be changed out from under an existing details row by a
 * later `PATCH /accounts/:id` — there is no SQL constraint that can express
 * "this FK's target row must have `kind = X`".
 */
import { and, eq, isNotNull, isNull, lte } from 'drizzle-orm';

import {
  AccountKindMismatchError,
  AccountNotFoundError,
  GiftCardDetailsNotFoundError,
  GiftCardEncryptionKeyMissingError,
} from '../errors.js';
import { accountGiftCardDetails, accounts, giftCardSecretReveals } from '../schema.js';
import { decryptGiftCardSecret, encryptGiftCardSecret } from './gift-card-crypto.js';

import type { FinanceDb } from './internal.js';

/** Raw drizzle row shape — never carries the decrypted secret. */
export type GiftCardDetailsRow = typeof accountGiftCardDetails.$inferSelect;

/** Fields accepted on write. The plaintext `number`/`pin` never persist as-is. */
export interface WriteGiftCardDetailsInput {
  number: string;
  pin: string;
  expiresOn?: string | null;
  issuerEntityId?: string | null;
}

/** What `revealGiftCardSecret` decrypts and returns once. */
export interface RevealedGiftCardSecret {
  number: string;
  pin: string;
}

function lastFourOf(number: string): string {
  return number.slice(-4);
}

/**
 * Throws `AccountNotFoundError` if `accountId` names no account, or
 * `AccountKindMismatchError` if it exists but isn't `kind: 'gift-card'`.
 */
function requireGiftCardAccount(db: FinanceDb, accountId: string): void {
  const account = db.select().from(accounts).where(eq(accounts.id, accountId)).get();
  if (!account) throw new AccountNotFoundError(accountId);
  if (account.kind !== 'gift-card') {
    throw new AccountKindMismatchError(accountId, account.kind, 'gift-card');
  }
}

/**
 * Write (create, or replace if one exists) a gift card's number and PIN.
 * Throws `AccountNotFoundError`/`AccountKindMismatchError` per
 * {@link requireGiftCardAccount}, and `GiftCardEncryptionKeyMissingError` if
 * `encryptionKey` is `undefined` — a write never falls back to storing the
 * secret unencrypted.
 */
export function writeGiftCardDetails(
  db: FinanceDb,
  accountId: string,
  encryptionKey: string | undefined,
  input: WriteGiftCardDetailsInput
): GiftCardDetailsRow {
  requireGiftCardAccount(db, accountId);
  if (encryptionKey === undefined) throw new GiftCardEncryptionKeyMissingError();

  const secretRef = encryptGiftCardSecret(encryptionKey, {
    number: input.number,
    pin: input.pin,
  });
  const lastFour = lastFourOf(input.number);
  const expiresOn = input.expiresOn ?? null;
  const issuerEntityId = input.issuerEntityId ?? null;

  db.insert(accountGiftCardDetails)
    .values({ accountId, lastFour, expiresOn, issuerEntityId, secretRef })
    .onConflictDoUpdate({
      target: accountGiftCardDetails.accountId,
      set: {
        lastFour,
        expiresOn,
        issuerEntityId,
        secretRef,
        updatedAt: new Date().toISOString(),
      },
    })
    .run();

  return getGiftCardDetails(db, accountId);
}

/**
 * Masked read: `lastFour`, `expiresOn`, `issuerEntityId` only — never touches
 * `secretRef`. Throws `AccountNotFoundError`/`AccountKindMismatchError` per
 * {@link requireGiftCardAccount}, or `GiftCardDetailsNotFoundError` if the
 * account is a gift card but no details have been written yet.
 */
export function getGiftCardDetails(db: FinanceDb, accountId: string): GiftCardDetailsRow {
  requireGiftCardAccount(db, accountId);
  const row = db
    .select()
    .from(accountGiftCardDetails)
    .where(eq(accountGiftCardDetails.accountId, accountId))
    .get();
  if (!row) throw new GiftCardDetailsNotFoundError(accountId);
  return row;
}

/**
 * Decrypt and return the plaintext number/PIN once, recording a
 * `gift_card_secret_reveals` audit row. Throws
 * `GiftCardEncryptionKeyMissingError` if `encryptionKey` is `undefined` — a
 * missing key can't decrypt, so a reveal fails the same way a write does
 * rather than through a separate error.
 */
export function revealGiftCardSecret(
  db: FinanceDb,
  accountId: string,
  encryptionKey: string | undefined
): RevealedGiftCardSecret {
  const row = getGiftCardDetails(db, accountId);
  if (encryptionKey === undefined) throw new GiftCardEncryptionKeyMissingError();

  const secret = decryptGiftCardSecret(encryptionKey, row.secretRef);

  db.insert(giftCardSecretReveals).values({ accountId }).run();

  return secret;
}

/** One row of {@link listExpiringGiftCards}. */
export interface ExpiringGiftCard {
  accountId: string;
  accountName: string;
  lastFour: string;
  expiresOn: string;
  issuerEntityId: string | null;
}

/**
 * Gift-card accounts (not archived) whose `expiresOn` falls within
 * `withinDays` of now.
 *
 * No REST route serves this — POPS-2750 (account balances) hasn't landed, so
 * there is no non-zero-balance filter to apply and no screen consumes an
 * "expiring gift cards" list yet. This ships the query only, deliberately
 * without faking a balance check the epic hasn't built.
 */
export function listExpiringGiftCards(db: FinanceDb, withinDays = 30): ExpiringGiftCard[] {
  const cutoff = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  const rows = db
    .select({
      accountId: accounts.id,
      accountName: accounts.name,
      lastFour: accountGiftCardDetails.lastFour,
      expiresOn: accountGiftCardDetails.expiresOn,
      issuerEntityId: accountGiftCardDetails.issuerEntityId,
    })
    .from(accountGiftCardDetails)
    .innerJoin(accounts, eq(accounts.id, accountGiftCardDetails.accountId))
    .where(
      and(
        eq(accounts.kind, 'gift-card'),
        isNull(accounts.archivedAt),
        isNotNull(accountGiftCardDetails.expiresOn),
        lte(accountGiftCardDetails.expiresOn, cutoff)
      )
    )
    .all();

  return rows.map((row) => ({
    accountId: row.accountId,
    accountName: row.accountName,
    lastFour: row.lastFour,
    // Non-null by the `isNotNull` filter above; SQLite's query builder can't
    // narrow the column's declared nullability from a WHERE clause.
    expiresOn: row.expiresOn as string,
    issuerEntityId: row.issuerEntityId,
  }));
}
