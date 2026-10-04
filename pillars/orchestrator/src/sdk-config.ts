import { configureServerSdk } from '@pops/pillar-sdk/server';

import {
  resolveServiceAccountKey,
  SERVICE_ACCOUNT_KEY_ENV,
  SERVICE_ACCOUNT_KEY_FILE_ENV,
} from './service-account.js';

/**
 * Configure the server SDK's credential before the HTTP server accepts search
 * requests.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns Whether an outbound service-account key was found.
 */
export function configureOrchestratorServerSdk(env: NodeJS.ProcessEnv = process.env): boolean {
  const apiKey = resolveServiceAccountKey(env);
  configureServerSdk({ apiKey });

  if (apiKey === undefined) {
    console.error(
      `[orchestrator] no service-account key: set ${SERVICE_ACCOUNT_KEY_FILE_ENV} to a mounted ` +
        `secret (production) or ${SERVICE_ACCOUNT_KEY_ENV} (local development). ` +
        'Federated search cannot call search-capable pillars.'
    );
    return false;
  }

  return true;
}
