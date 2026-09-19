/**
 * The one place this pillar binds the server SDK's configuration from the
 * environment.
 *
 * `pillar()` from `@pops/pillar-sdk/server` reads a process-wide config for
 * the service-account key it attaches as `X-API-Key`. Production delivers
 * the key as a mounted Docker secret, and only this module knows to read the
 * file (see `../secret-source.ts`).
 *
 * A missing key is not fatal: inventory's own contract surface is entirely
 * local and works without one; only `codes/suggest`'s AI ranking degrades to
 * its deterministic fallback. What must not happen is degrading *quietly*
 * with per-request noise, so the absence is reported once at boot and
 * `credentialled()` reports it once per pillar id thereafter — never on
 * every `codes/suggest` call.
 */
import { configureServerSdk } from '@pops/pillar-sdk/server';

import {
  resolveServiceAccountKey,
  SERVICE_ACCOUNT_KEY_ENV,
  SERVICE_ACCOUNT_KEY_FILE_ENV,
} from './service-account.js';

/**
 * Outbound pillar-to-pillar call budget for ranking code suggestions. Short
 * because it sits inline in `codes/suggest`'s response path: a slow `ai`
 * pillar must not turn a fast local suggestion into a slow request, so the
 * caller (`../ai/client.ts`) treats a timeout exactly like any other
 * failure and returns the deterministic order.
 */
const OUTBOUND_CALL_TIMEOUT_MS = 2_000;

/**
 * Bind the process-wide server SDK config from the environment.
 *
 * Called once, before the server listens.
 *
 * @param env Process environment to read; injectable for tests.
 * @returns Whether a service-account key was found. `false` means
 *   `codes/suggest` will use its deterministic order for every request in
 *   this process.
 */
export function configureInventoryServerSdk(env: NodeJS.ProcessEnv = process.env): boolean {
  const apiKey = resolveServiceAccountKey(env);
  if (apiKey === undefined) {
    // Cleared rather than left alone, so "this environment has no key" cannot
    // be answered by one an earlier call left behind. Production calls this
    // once; a test or a reload calling it twice must not silently keep
    // authenticating as the first environment.
    configureServerSdk({ apiKey: undefined, callTimeoutMs: OUTBOUND_CALL_TIMEOUT_MS });
    console.error(
      `[inventory-api] no service-account key: set ${SERVICE_ACCOUNT_KEY_FILE_ENV} to a mounted ` +
        `secret (production) or ${SERVICE_ACCOUNT_KEY_ENV} (local dev). The API serves normally; ` +
        "codes/suggest uses its deterministic order and never calls the 'ai' pillar."
    );
    return false;
  }
  // Passed explicitly rather than left to the SDK's own env fallback: only
  // this module knows about the file-based secret, and explicit beats env.
  configureServerSdk({ apiKey, callTimeoutMs: OUTBOUND_CALL_TIMEOUT_MS });
  return true;
}
