/**
 * The `bfm` service-account credential: what it is granted, and where the
 * process finds it.
 *
 * bfm reaches siblings through `pillar()` from `@pops/pillar-sdk/server`,
 * which sends this key as `X-API-Key` on every outbound call. The account is
 * minted once by an operator against the registry pillar's admin surface —
 * runbook in the pillar README — and never by this process: that surface is
 * `userOnly` and rejects a machine principal unconditionally, precisely so a
 * service account cannot mint another.
 *
 * The file source is preferred over the environment one because production
 * delivers the key as a Docker file-based secret mounted under `/run/secrets/`,
 * which keeps it out of the process environment and out of `docker inspect`.
 * The value itself is never logged; only its absence and the path it was
 * looked for at are.
 */
import { readFileSync } from 'node:fs';

/** Registry-side account name. Must match what the operator minted. */
export const BFM_SERVICE_ACCOUNT_NAME = 'bfm';

/**
 * What the account is granted, and nothing more.
 *
 * One entry, because bfm makes one sibling call: the mobile transactions
 * screen reads finance's `transactions.*`. Every later mobile surface widens
 * this list in its own ticket, so it stays a readable record of what bfm
 * actually calls rather than a wildcard nobody can audit. Scopes match by dot
 * prefix, so `finance.transactions` authorises `finance.transactions.list`
 * but not `finance.budgets.list`.
 *
 * Enforcement today is narrower than the list implies: the registry pillar is
 * the only one that checks `X-API-Key` at all, and its scope gate covers
 * `core.features.*` / `core.settings.*`. finance accepts any in-network
 * caller. The grant is the declaration of intent, and becomes load-bearing the
 * moment a producer starts checking.
 */
export const BFM_SERVICE_ACCOUNT_SCOPES: readonly string[] = ['finance.transactions'];

/** Local-dev source: the key inline in the environment. */
export const SERVICE_ACCOUNT_KEY_ENV = 'POPS_INTERNAL_API_KEY';

/** Production source: a path to a mounted Docker secret holding the key. */
export const SERVICE_ACCOUNT_KEY_FILE_ENV = 'POPS_INTERNAL_API_KEY_FILE';

/**
 * Raised at boot when neither source yields a key. Fatal by design: bfm exists
 * to call sibling pillars, and a process that starts without a credential
 * looks healthy right up until the phone makes its first real request.
 */
export class MissingServiceAccountKeyError extends Error {
  override readonly name = 'MissingServiceAccountKeyError' as const;

  constructor() {
    super(
      `[bfm-api] no service-account key available: set ${SERVICE_ACCOUNT_KEY_FILE_ENV} to a ` +
        `mounted secret (production) or ${SERVICE_ACCOUNT_KEY_ENV} (local dev). bfm cannot ` +
        'authenticate a single cross-pillar call without one.'
    );
  }
}

/**
 * Resolve the service-account key, file source first.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns The trimmed key, or `undefined` when neither source yields a
 *   non-empty value.
 */
export function resolveServiceAccountKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const fromFile = readKeyFile(env[SERVICE_ACCOUNT_KEY_FILE_ENV]);
  if (fromFile !== undefined) return fromFile;
  const fromEnv = env[SERVICE_ACCOUNT_KEY_ENV]?.trim();
  return fromEnv === undefined || fromEnv === '' ? undefined : fromEnv;
}

/**
 * An unreadable secret file is warned about rather than thrown: the
 * environment variable may still carry a usable key, and the caller crashes
 * boot when neither source produces one. Reporting the path is safe; reporting
 * the contents never is.
 */
function readKeyFile(path: string | undefined): string | undefined {
  if (path === undefined || path.trim() === '') return undefined;
  let contents: string;
  try {
    contents = readFileSync(path, 'utf8').trim();
  } catch (error) {
    console.warn(
      `[bfm-api] could not read ${SERVICE_ACCOUNT_KEY_FILE_ENV} (${path}): ` +
        (error instanceof Error ? error.message : String(error))
    );
    return undefined;
  }
  return contents === '' ? undefined : contents;
}
