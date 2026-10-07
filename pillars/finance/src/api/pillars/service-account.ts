/**
 * The `finance` service-account credential: what it is granted, and where
 * the process finds it.
 *
 * finance reaches sibling pillars through `pillar()` from
 * `@pops/pillar-sdk/server`, which sends this key as `X-API-Key` on every
 * outbound call. The account is minted once by an operator against the
 * registry pillar's admin surface — runbook in `pillars/bfm/README.md`
 * ("Provisioning the service account") — and never by this process: that
 * surface is `userOnly` and rejects a machine principal unconditionally,
 * precisely so a service account cannot mint another.
 *
 * The file source is preferred over the environment one because production
 * delivers the key as a Docker file-based secret mounted under
 * `/run/secrets/`, which keeps it out of the process environment and out of
 * `docker inspect`.
 */
import { resolveSecret } from '../secret-source.js';

/** Registry-side account name. Must match what the operator minted. */
export const FINANCE_SERVICE_ACCOUNT_NAME = 'finance';

/**
 * What the account is granted, and nothing more.
 *
 * One entry per outbound leg this pillar actually has, so the list stays a
 * readable record of what finance calls rather than a wildcard nobody can
 * audit. Scopes match by dot prefix, so each grant authorises only its named
 * domain.
 *
 * - `contacts.entities` — the entity matcher, the usage rollup and the
 *   create-or-fetch pre-create, `src/api/contacts/client.ts`.
 * - `purchases.receipt` — storing, pinning and reading the files attached to
 *   a transaction, `src/api/purchases/client.ts`.
 * - `registry.users` — the nightly owner-URI reconciliation cron,
 *   `src/api/cron/pillar-lookup.ts`.
 * - `tags.tags` — shared vocabulary reads and creates,
 *   `src/api/tags/client.ts`.
 *
 * The tags API enforces `tags.tags` and purchases enforces `purchases.receipt`.
 * Registry's `users.get` handler reads no
 * principal, and the Rust `contacts` pillar has no auth middleware — see the
 * note in `pillars/finance/src/api/pillars/outbound.ts`. Those grants are
 * declared too, so either producer can enforce them later without a second
 * migration.
 */
export const FINANCE_SERVICE_ACCOUNT_SCOPES: readonly string[] = [
  'contacts.entities',
  'purchases.receipt',
  'registry.users',
  'tags.tags',
];

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
