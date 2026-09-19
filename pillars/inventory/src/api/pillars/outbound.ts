/**
 * What inventory's one outbound cross-pillar leg does about the credential,
 * plus the vocabulary it reports a credential problem in.
 *
 * Copies the shape `pillars/finance/src/api/pillars/outbound.ts` and
 * `pillars/purchases/src/api/pillars/outbound.ts` already use: `pillar()`
 * from `@pops/pillar-sdk/server` (not `/client`, which sends no `X-API-Key`
 * and would fail as an indistinguishable outage the day `ai` starts
 * enforcing a credential, POPS-2021), wrapped in {@link credentialled} so a
 * process with no key answers `null` instead of throwing.
 *
 * The wrapper takes a thunk rather than a pillar id, so the `pillar()` call
 * stays at the leg with its literal id and its router type, which is what
 * `scripts/ci/check-cross-pillar-expectations.mjs` reads to pin the seam to
 * the producer's published contract.
 */
import { PillarServerSdkError, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  INVENTORY_SERVICE_ACCOUNT_NAME,
  SERVICE_ACCOUNT_KEY_ENV,
  SERVICE_ACCOUNT_KEY_FILE_ENV,
} from './service-account.js';

/** No credential was presented: this process never had a key to send. */
export const NO_CREDENTIAL_REASON = 'no-credential';

/** A credential was presented and the callee rejected it (401 / 403). */
export const UNAUTHORIZED_REASON = 'unauthorized';

/**
 * Pillar ids already reported as unreachable-for-want-of-a-key.
 *
 * The absence of a key is a process-wide fact that cannot change without a
 * restart, so one line per pillar at first use says everything a repeated
 * one would.
 */
const reportedMissingKey = new Set<string>();

/**
 * Build a leg's handle, answering `null` instead of throwing when this
 * process holds no service-account key.
 *
 * @param pillarId Registry id of the pillar being called, for the log line.
 * @param connect Builds the handle — always `() => pillar<TRouter>(id)` from
 *   `@pops/pillar-sdk/server`, called here so its refusal is handled once.
 * @returns The handle, or `null` when there is no key — the caller then
 *   falls back rather than attempting an anonymous call the callee may or
 *   may not still admit.
 */
export function credentialled<TRouter>(
  pillarId: string,
  connect: () => PillarHandle<TRouter>
): PillarHandle<TRouter> | null {
  try {
    return connect();
  } catch (error) {
    if (!(error instanceof PillarServerSdkError)) throw error;
    if (!reportedMissingKey.has(pillarId)) {
      reportedMissingKey.add(pillarId);
      console.error(
        `[inventory-api] cannot call '${pillarId}': no service-account key in this process. ` +
          `Set ${SERVICE_ACCOUNT_KEY_FILE_ENV} to a mounted secret (production) or ` +
          `${SERVICE_ACCOUNT_KEY_ENV} (local dev). This is a configuration problem, not an outage.`
      );
    }
    return null;
  }
}

/**
 * The line an outbound leg logs when a callee rejects the credential.
 *
 * @param pillarId Registry id of the pillar that refused.
 * @param operation Dotted procedure path that was called.
 */
export function credentialRejectedMessage(pillarId: string, operation: string): string {
  return (
    `[inventory-api] ${pillarId} rejected this pillar's service-account credential on ` +
    `${operation} — the '${INVENTORY_SERVICE_ACCOUNT_NAME}' account is missing, revoked, or not ` +
    'granted this scope. Nothing was written; this is a credential problem, not an outage.'
  );
}

/** Test-only: forget which pillars have already been reported. */
export function __resetOutboundCredentialReports(): void {
  reportedMissingKey.clear();
}
