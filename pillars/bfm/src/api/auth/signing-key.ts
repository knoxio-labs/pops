/**
 * Where the access-token signing key comes from, and what makes a value
 * acceptable.
 *
 * Production delivers it as a Docker file-based secret mounted under
 * `/run/secrets/`, which keeps it out of the process environment and out of
 * `docker inspect`; the inline variable exists for local dev and tests.
 *
 * Two deliberate departures from the fleet's other secret readers
 * (`pillars/purchases/src/api/anthropic-key.ts` and its siblings), both
 * because this key is the perimeter rather than a feature:
 *
 *   - **An unreadable file is fatal, not a fallback.** Falling back to the
 *     inline variable when the mount fails would silently downgrade
 *     production to whatever a dev value happened to be, and the symptom
 *     would be tokens that verify against the wrong key — indistinguishable
 *     from forgery.
 *   - **The resolved key is a `KeyObject`, never a string.** It cannot be
 *     concatenated into a log line or a JSON body by accident, so "never log
 *     the key" is a property of the type rather than a rule someone has to
 *     remember.
 */
import { createSecretKey, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';

/** Path to the mounted secret. Preferred over {@link ACCESS_TOKEN_SECRET_VAR}. */
export const ACCESS_TOKEN_SECRET_FILE_VAR = 'BFM_ACCESS_TOKEN_SECRET_FILE';

/** The secret inline, for local dev and tests. */
export const ACCESS_TOKEN_SECRET_VAR = 'BFM_ACCESS_TOKEN_SECRET';

/**
 * HS256's strength is bounded by the key, not by the algorithm: HMAC-SHA-256
 * offers at most a 256-bit security level, and a shorter key is the weakest
 * link in the construction. 32 characters is a floor rather than a target —
 * the value should be CSPRNG output (`openssl rand -base64 48`), not a
 * passphrase, since a guessable key forges every device's token at once.
 */
export const MIN_ACCESS_TOKEN_SECRET_LENGTH = 32;

export class AccessTokenSecretError extends Error {
  override readonly name = 'AccessTokenSecretError' as const;
}

interface ConfiguredSecret {
  value: string;
  /** Which variable supplied it, so a rejection names something actionable. */
  source: string;
}

function readConfiguredSecret(env: NodeJS.ProcessEnv): ConfiguredSecret {
  const filePath = env[ACCESS_TOKEN_SECRET_FILE_VAR]?.trim();
  if (filePath !== undefined && filePath !== '') {
    try {
      return { value: readFileSync(filePath, 'utf8').trim(), source: ACCESS_TOKEN_SECRET_FILE_VAR };
    } catch (error) {
      throw new AccessTokenSecretError(
        `[bfm-api] could not read ${ACCESS_TOKEN_SECRET_FILE_VAR} (${filePath}): ` +
          (error instanceof Error ? error.message : String(error))
      );
    }
  }

  const inline = env[ACCESS_TOKEN_SECRET_VAR];
  if (inline !== undefined && inline.trim() !== '') {
    return { value: inline.trim(), source: ACCESS_TOKEN_SECRET_VAR };
  }

  throw new AccessTokenSecretError(
    `[bfm-api] no access-token signing key: set ${ACCESS_TOKEN_SECRET_FILE_VAR} to a mounted ` +
      `secret, or ${ACCESS_TOKEN_SECRET_VAR} for local dev`
  );
}

/**
 * Resolve the HMAC key that {@link import('./access-token.js').mintAccessToken}
 * signs with and `requireDevice` verifies against.
 *
 * Both sources are trimmed, because a secret written with `echo` carries a
 * trailing newline and an operator who exported one in a shell did not intend
 * the whitespace either. Trimming cannot desynchronise the two halves: minting
 * and verification resolve through this one function, so they always agree on
 * the bytes.
 *
 * @throws {AccessTokenSecretError} when neither source yields a value, when
 * the file cannot be read, or when the value is shorter than
 * {@link MIN_ACCESS_TOKEN_SECRET_LENGTH}. Every message names the variable and
 * never the value.
 */
export function resolveAccessTokenSigningKey(env: NodeJS.ProcessEnv = process.env): KeyObject {
  const { value, source } = readConfiguredSecret(env);
  if (value.length < MIN_ACCESS_TOKEN_SECRET_LENGTH) {
    throw new AccessTokenSecretError(
      `[bfm-api] ${source} is too short: the access-token signing key must be at least ` +
        `${String(MIN_ACCESS_TOKEN_SECRET_LENGTH)} characters`
    );
  }
  return createSecretKey(Buffer.from(value, 'utf8'));
}
