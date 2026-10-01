import { readFileSync } from 'node:fs';

/** Registry account name used by the orchestrator's outbound calls. */
export const ORCHESTRATOR_SERVICE_ACCOUNT_NAME = 'orchestrator';

/** Exact operation scopes needed by the current search-capable pillars. */
export const ORCHESTRATOR_SERVICE_ACCOUNT_SCOPES: readonly string[] = [
  'contacts.search.search',
  'purchases.search.search',
];

/** Environment variable containing the local-development credential. */
export const SERVICE_ACCOUNT_KEY_ENV = 'POPS_INTERNAL_API_KEY';

/** Environment variable containing the mounted production-secret path. */
export const SERVICE_ACCOUNT_KEY_FILE_ENV = 'POPS_INTERNAL_API_KEY_FILE';

/**
 * Resolve the service-account key from a mounted file first, then the local
 * environment value.
 */
export function resolveServiceAccountKey(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const filePath = env[SERVICE_ACCOUNT_KEY_FILE_ENV]?.trim();
  if (filePath !== undefined && filePath !== '') {
    try {
      const fromFile = readFileSync(filePath, 'utf-8').trim();
      if (fromFile !== '') return fromFile;
    } catch (error) {
      console.warn(
        `[orchestrator] could not read ${SERVICE_ACCOUNT_KEY_FILE_ENV} (${filePath}): ` +
          `${error instanceof Error ? error.message : String(error)} — ` +
          `falling back to ${SERVICE_ACCOUNT_KEY_ENV}`
      );
    }
  }

  const fromEnvironment = env[SERVICE_ACCOUNT_KEY_ENV]?.trim();
  return fromEnvironment === undefined || fromEnvironment === '' ? undefined : fromEnvironment;
}
