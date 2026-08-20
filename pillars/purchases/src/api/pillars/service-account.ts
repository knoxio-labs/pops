/**
 * The `purchases` service-account credential: what it is granted, and where
 * the process finds it.
 *
 * purchases reaches four siblings, on five legs, through `pillar()` from
 * `@pops/pillar-sdk/server`, which sends this key as `X-API-Key` on every
 * outbound call. The account is minted once by an operator against the
 * registry pillar's admin surface — runbook in the pillar README — and never
 * by this process: that surface is `userOnly` and rejects a machine principal
 * unconditionally, precisely so a service account cannot mint another.
 *
 * The file source is preferred over the environment one because production
 * delivers the key as a Docker file-based secret mounted under
 * `/run/secrets/`, which keeps it out of the process environment and out of
 * `docker inspect`.
 */
import { resolveSecret } from '../secret-source.js';

/** Registry-side account name. Must match what the operator minted. */
export const PURCHASES_SERVICE_ACCOUNT_NAME = 'purchases';

/**
 * What the account is granted, and nothing more.
 *
 * One entry per producer resource this pillar actually reaches, so the list
 * stays a readable record of what purchases calls rather than a wildcard
 * nobody can audit. Scopes match by dot prefix, so `finance.transactions`
 * authorises `finance.transactions.list` but not `finance.budgets.list` —
 * and, on the same rule, `inventory.items` authorises every operation on
 * that resource rather than the one the leg below names.
 *
 * - `finance.transactions` — the reconciliation sweep's candidate fetch
 *   (`transactions.list`), `src/api/finance/client.ts`.
 * - `inventory.items` and `documents.paperless` — the nightly soft-URI
 *   reconciliation legs (`items.get`, `paperless.get`),
 *   `src/api/cron/pillar-lookup.ts`. `inventory.items` also authorises
 *   `items.create`, which `src/api/inventory/client.ts` calls when a human
 *   accepts an inventory proposal: prefix matching cannot express "read
 *   items, write none", so that leg widens what this account does to
 *   inventory without widening the list below. The list is not the record
 *   of that change and cannot be — the leg's own file, the README's
 *   outbound table and this paragraph are.
 * - `contacts.entities` — receipt ingest's merchant resolution
 *   (`entities.list`), `src/api/contacts/merchant.ts`.
 *
 * Each callee derives its own scope table from its contract, so a fifth leg
 * added without widening this list gets a `403` from the pillar it calls the
 * day that pillar requires a credential.
 */
export const PURCHASES_SERVICE_ACCOUNT_SCOPES: readonly string[] = [
  'contacts.entities',
  'documents.paperless',
  'finance.transactions',
  'inventory.items',
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
