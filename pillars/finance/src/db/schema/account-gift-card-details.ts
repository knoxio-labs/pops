import { sql } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

import { accounts } from './accounts.js';

/**
 * Extension row for a `gift-card`-kind account (POPS-2772). One row per
 * account, keyed by `account_id` itself rather than a synthetic id — a
 * gift card has exactly one number/PIN pair, so there is nothing a
 * separate id would disambiguate.
 *
 * `secret_ref` holds the encrypted `{ number, pin }` blob (see
 * `services/gift-card-crypto.ts`) — it is never decrypted on a masked read.
 * `last_four` is plaintext, populated at write time from the plaintext
 * number, so a masked read never needs to touch the encrypted blob at all.
 *
 * Only a `gift-card`-kind account may have a row here — enforced at the
 * service layer (`services/gift-card-details.ts`), not by a SQL constraint,
 * since SQLite can't express "this FK's target row must have `kind = X`".
 */
export const accountGiftCardDetails = sqliteTable('account_gift_card_details', {
  accountId: text('account_id')
    .primaryKey()
    .references(() => accounts.id),
  /** Plaintext, not secret — the last 4 digits of the card number. */
  lastFour: text('last_four').notNull(),
  /** Nullable — some gift cards carry no expiry. ISO `YYYY-MM-DD`. */
  expiresOn: text('expires_on'),
  /** Nullable — the contacts entity that issued/sold this card, if known. */
  issuerEntityId: text('issuer_entity_id'),
  /** Base64 `iv|tag|ciphertext` blob encrypting `{ number, pin }`. */
  secretRef: text('secret_ref').notNull(),
  createdAt: text('created_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
  updatedAt: text('updated_at')
    .notNull()
    .default(sql`(strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`),
});
