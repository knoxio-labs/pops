/**
 * Named secrets for provider tokens (POPS-30, ADR-052).
 *
 * `account_import_config.secret_ref` stores the NAME of a secret, never its
 * value. The value is resolved at use from `<name>_FILE` (a Docker secret
 * mounted as a file, the way every pillar credential ships) or, failing that,
 * from the environment variable `<name>` itself. Nothing is cached: a sync
 * runs a few times a day and a token that has been rotated should be picked
 * up by the next run, not the next deploy.
 */
import { readFileSync } from 'node:fs';

const SECRET_NAME = /^[A-Z][A-Z0-9_]*$/;

/** A `secret_ref` that is not a plain environment-variable name. */
export class InvalidSecretNameError extends Error {
  override readonly name = 'InvalidSecretNameError' as const;
  constructor(readonly secretName: string) {
    super(`Secret name '${secretName}' must be an upper-case environment-variable name`);
  }
}

/** Neither `<name>_FILE` nor `<name>` yields a value. */
export class MissingSecretError extends Error {
  override readonly name = 'MissingSecretError' as const;
  constructor(readonly secretName: string) {
    super(`Missing secret: set ${secretName}_FILE (a file path) or ${secretName}`);
  }
}

/** The secret's value, or undefined when neither source has one. */
export function readNamedSecret(
  name: string,
  env: NodeJS.ProcessEnv = process.env
): string | undefined {
  if (!SECRET_NAME.test(name)) throw new InvalidSecretNameError(name);
  const filePath = env[`${name}_FILE`];
  const value = filePath ? readFileSync(filePath, 'utf-8') : env[name];
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed;
}

/** Like {@link readNamedSecret}, but a missing value is an error. */
export function requireNamedSecret(name: string, env: NodeJS.ProcessEnv = process.env): string {
  const value = readNamedSecret(name, env);
  if (value === undefined) throw new MissingSecretError(name);
  return value;
}
