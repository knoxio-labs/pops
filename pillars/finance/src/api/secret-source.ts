/**
 * Reading a secret that arrives either as a mounted file or as an
 * environment variable.
 *
 * Production delivers credentials as Docker file-based secrets, which keeps
 * them out of the process environment and out of `docker inspect`; local dev
 * and tests set the value inline. Every secret this pillar reads wants both
 * sources in the same order, so the order lives here once rather than in each
 * reader (ADR-039 E24) — the same split `pillars/purchases/src/api/secret-source.ts`
 * uses.
 *
 * The value is never logged. A configured-but-unreadable file is warned about
 * by path and then falls through to the environment, because the environment
 * may still carry a usable value and the caller is better placed to decide
 * what an absent secret costs.
 */
import { readFileSync } from 'node:fs';

/** The two places one secret may be found. Their names are what a log says. */
export interface SecretSource {
  /** Variable naming a file that holds the value (production). */
  readonly fileEnvVar: string;
  /** Variable holding the value itself (local dev, tests). */
  readonly envVar: string;
  /** Environment to read; injectable for tests. */
  readonly env?: NodeJS.ProcessEnv;
}

/**
 * Resolve a secret, file source first.
 *
 * @param source Which variables to read.
 * @returns The trimmed secret, or `undefined` when neither source yields a
 *   non-empty value.
 */
export function resolveSecret(source: SecretSource): string | undefined {
  const env = source.env ?? process.env;
  const fromFile = readSecretFile(env[source.fileEnvVar], source);
  if (fromFile !== undefined) return fromFile;
  const fromEnv = env[source.envVar]?.trim();
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

function readSecretFile(rawPath: string | undefined, source: SecretSource): string | undefined {
  // Trimmed before it is opened, not just before it is tested: a path with
  // stray whitespace from a `.env` edit or a templated compose file names a
  // file that does not exist, and the fallback would then authenticate as
  // whatever the environment variable happens to hold.
  const path = rawPath?.trim() ?? '';
  if (path === '') return undefined;
  let contents: string;
  try {
    contents = readFileSync(path, 'utf-8').trim();
  } catch (error) {
    console.warn(
      `[finance] could not read ${source.fileEnvVar} (${path}): ` +
        `${error instanceof Error ? error.message : String(error)} — ` +
        `falling back to ${source.envVar}`
    );
    return undefined;
  }
  return contents === '' ? undefined : contents;
}
