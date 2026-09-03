/**
 * AES-256-GCM crypto for `account_gift_card_details.secret_ref` (POPS-2772).
 *
 * `secret_ref` stores a single base64 blob: `iv (12 bytes) | tag (16 bytes) |
 * ciphertext` — the same layout `pillars/media/src/api/clients/plex/crypto.ts`
 * already uses, for the same reason: one field to persist and pass around
 * rather than three. The plaintext underneath is
 * `JSON.stringify({ number, pin })` rather than two separately-encrypted
 * columns — a gift card's number and PIN are always written and revealed
 * together, so there is no use case for recovering one without the other,
 * and one blob is one less place for the two to drift out of sync.
 *
 * The AES key is derived from an operator-supplied secret via `scrypt`,
 * mirroring Plex's key-stretching, but — unlike Plex — this module never
 * generates or persists a key on its own. Plex's token is a re-issuable
 * device credential, so a silently-generated fallback key costs nothing
 * worse than a re-login. A gift card's number is exactly the kind of thing
 * this feature exists to recover; a key that could regenerate itself would
 * make an already-written secret permanently unrecoverable. Key resolution
 * (env var vs Docker file secret) lives in `src/api/gift-card-encryption-key.ts`,
 * outside this module, so this stays pure and trivially testable.
 */
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32;
const SCRYPT_SALT = 'pops-finance-gift-card';

/** The two secret fields a gift card's `secret_ref` encrypts together. */
export interface GiftCardSecret {
  number: string;
  pin: string;
}

function deriveKey(encryptionKey: string): Buffer {
  return scryptSync(encryptionKey, SCRYPT_SALT, KEY_LENGTH);
}

/** Encrypt `secret` and return the base64 `iv|tag|ciphertext` blob. */
export function encryptGiftCardSecret(encryptionKey: string, secret: GiftCardSecret): string {
  const key = deriveKey(encryptionKey);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = JSON.stringify(secret);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Reverse {@link encryptGiftCardSecret}. Throws if the auth tag fails to
 * verify — a wrong `encryptionKey` or a corrupted blob, indistinguishably.
 */
export function decryptGiftCardSecret(encryptionKey: string, secretRef: string): GiftCardSecret {
  const key = deriveKey(encryptionKey);
  const buf = Buffer.from(secretRef, 'base64');
  const iv = buf.subarray(0, IV_LENGTH);
  const tag = buf.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = buf.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  const plaintext = decipher.update(encrypted, undefined, 'utf8') + decipher.final('utf8');
  return JSON.parse(plaintext) as GiftCardSecret;
}
