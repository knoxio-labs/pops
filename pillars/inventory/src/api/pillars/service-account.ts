/**
 * The `inventory` service-account credential: what it is granted, and where
 * the process finds it.
 *
 * Inventory has no outbound credential of its own before this (POPS-4081):
 * `codes/suggest`'s deterministic numbering never left the process. Ranking
 * those candidates through the `ai` pillar is the first outbound leg, so
 * this file, `../secret-source.ts` and `./outbound.ts` are new rather than
 * widened, copying the shape `pillars/finance/src/api/pillars/service-account.ts`
 * and `pillars/purchases/src/api/pillars/service-account.ts` already use.
 *
 * The account is minted once by an operator against the registry pillar's
 * admin surface, never by this process. The file source is preferred over
 * the environment one because production delivers the key as a Docker
 * file-based secret mounted under `/run/secrets/`, which keeps it out of the
 * process environment and out of `docker inspect`.
 */
import { resolveSecret } from '../secret-source.js';

/** Registry-side account name. Must match what the operator minted. */
export const INVENTORY_SERVICE_ACCOUNT_NAME = 'inventory';

/**
 * What the account is granted, and nothing more.
 *
 * One entry per outbound leg this pillar actually has, so the list stays a
 * readable record of what inventory calls rather than a wildcard nobody can
 * audit. Scopes match by dot prefix.
 *
 * - `ai.codes.rank` — ranking `codes/suggest`'s deterministic candidates,
 *   `../ai/client.ts`. The `ai` pillar has no candidate-ranking route today
 *   (POPS-4081's report says so); the scope name is proposed here so the
 *   grant and this pillar's call are ready the day that route exists,
 *   matching the pattern finance's `service-account.ts` documents for a
 *   producer that has not yet started enforcing scopes.
 */
export const INVENTORY_SERVICE_ACCOUNT_SCOPES: readonly string[] = ['ai.codes.rank'];

/** Local-dev source: the key inline in the environment. */
export const SERVICE_ACCOUNT_KEY_ENV = 'POPS_INTERNAL_API_KEY';

/** Production source: a path to a mounted Docker secret holding the key. */
export const SERVICE_ACCOUNT_KEY_FILE_ENV = 'POPS_INTERNAL_API_KEY_FILE';

/**
 * Resolve the service-account key, file source first.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns The trimmed key, or `undefined` when neither source yields a
 *   non-empty value.
 */
export function resolveServiceAccountKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return resolveSecret({
    fileEnvVar: SERVICE_ACCOUNT_KEY_FILE_ENV,
    envVar: SERVICE_ACCOUNT_KEY_ENV,
    env,
  });
}
