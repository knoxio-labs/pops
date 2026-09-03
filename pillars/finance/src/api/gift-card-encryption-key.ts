/**
 * The AES key material for gift-card `secret_ref` encryption
 * (`db/services/gift-card-crypto.ts`, POPS-2772): what env vars carry it, and
 * how it's resolved.
 *
 * Follows the same file-then-env split every other secret in this pillar
 * uses (`src/api/secret-source.ts`, also `pillars/finance/src/api/pillars/service-account.ts`):
 * production mounts the key as a Docker file-based secret, local dev and
 * tests set it inline.
 */
import { resolveSecret } from './secret-source.js';

/** Local-dev source: the key inline in the environment. */
export const GIFT_CARD_ENCRYPTION_KEY_ENV = 'FINANCE_GIFT_CARD_ENCRYPTION_KEY';

/** Production source: a path to a mounted Docker secret holding the key. */
export const GIFT_CARD_ENCRYPTION_KEY_FILE_ENV = 'FINANCE_GIFT_CARD_ENCRYPTION_KEY_FILE';

/**
 * Resolve the gift-card encryption key, file source first.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns The trimmed key, or `undefined` when neither source yields a
 *   non-empty value — callers must not fall back to storing/returning a
 *   secret in the clear when this is `undefined`.
 */
export function resolveGiftCardEncryptionKey(
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  return resolveSecret({
    fileEnvVar: GIFT_CARD_ENCRYPTION_KEY_FILE_ENV,
    envVar: GIFT_CARD_ENCRYPTION_KEY_ENV,
    env,
  });
}
