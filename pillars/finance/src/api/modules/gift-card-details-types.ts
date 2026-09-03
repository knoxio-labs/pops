/**
 * Wire mapper for the gift-card-details domain (POPS-2772). The zod schemas
 * live in the REST contract (`src/contract/rest-gift-card-details.ts`); this
 * file keeps only the row → response projection and its TS shape.
 */
import type { GiftCardDetailsRow, RevealedGiftCardSecret } from '../../db/index.js';

/** Masked API response shape — never the plaintext number/PIN. */
export interface GiftCardDetails {
  accountId: string;
  lastFour: string;
  expiresOn: string | null;
  issuerEntityId: string | null;
}

/** Wire body accepted by `PUT /accounts/:id/gift-card-details`. */
export interface WriteGiftCardDetailsBody {
  number: string;
  pin: string;
  expiresOn?: string | null;
  issuerEntityId?: string | null;
}

/** Wire response for `POST /accounts/:id/gift-card-details/reveal`. */
export interface RevealedGiftCardSecretResponse {
  number: string;
  pin: string;
}

/** Map a SQLite row to the masked API response shape. */
export function toGiftCardDetails(row: GiftCardDetailsRow): GiftCardDetails {
  return {
    accountId: row.accountId,
    lastFour: row.lastFour,
    expiresOn: row.expiresOn,
    issuerEntityId: row.issuerEntityId,
  };
}

/** Map a decrypted secret to the reveal response shape. */
export function toRevealedGiftCardSecret(
  secret: RevealedGiftCardSecret
): RevealedGiftCardSecretResponse {
  return { number: secret.number, pin: secret.pin };
}
