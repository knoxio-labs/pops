/**
 * The one place this pillar binds the server SDK's configuration from the
 * environment.
 *
 * `pillar()` from `@pops/pillar-sdk/server` reads a process-wide config for
 * the service-account key it attaches as `X-API-Key`. The SDK's own fallback
 * reads `POPS_INTERNAL_API_KEY` from the environment at call time, which is
 * enough for local dev and nothing else: production delivers the key as a
 * mounted Docker secret, and only this module knows to read the file.
 *
 * **A missing key is not fatal here, unlike in `bfm`.** bfm exists to call
 * siblings and authenticate phones, so a bfm that starts without a credential
 * reports healthy while being able to do neither. purchases' own contract
 * surface — the order, line and charge readers, receipt and export ingest —
 * is entirely local and works without one; only reconciliation, merchant
 * resolution and the soft-URI cron degrade. Crashing would trade a degraded
 * reconciliation for a dead pillar and an unserved SPA. What must not happen
 * is degrading *quietly*, so the absence is reported at boot, and every leg
 * reports `no-credential` rather than folding into `unavailable`.
 */
import { configureServerSdk } from '@pops/pillar-sdk/server';

import {
  resolveServiceAccountKey,
  SERVICE_ACCOUNT_KEY_ENV,
  SERVICE_ACCOUNT_KEY_FILE_ENV,
} from './service-account.js';

/**
 * Bind the process-wide server SDK config from the environment.
 *
 * Called once, before the server listens.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns Whether a service-account key was found. `false` means every
 *   outbound cross-pillar call in this process will report `no-credential`.
 */
export function configurePurchasesServerSdk(env: NodeJS.ProcessEnv = process.env): boolean {
  const apiKey = resolveServiceAccountKey(env);
  if (apiKey === undefined) {
    // Cleared rather than left alone, so "this environment has no key" cannot
    // be answered by one an earlier call left behind. Production calls this
    // once; a test or a reload calling it twice must not silently keep
    // authenticating as the first environment.
    configureServerSdk({ apiKey: undefined });
    console.error(
      `[purchases-api] no service-account key: set ${SERVICE_ACCOUNT_KEY_FILE_ENV} to a mounted ` +
        `secret (production) or ${SERVICE_ACCOUNT_KEY_ENV} (local dev). The API serves normally; ` +
        'reconciliation, merchant resolution and the soft-URI cron cannot call out and will ' +
        'report no-credential every tick.'
    );
    return false;
  }
  // Passed explicitly rather than left to the SDK's own env fallback: only
  // this module knows about the file-based secret, and explicit beats env.
  configureServerSdk({ apiKey });
  return true;
}
