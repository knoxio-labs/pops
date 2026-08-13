/**
 * What every outbound cross-pillar leg does about the credential, in one
 * place, plus the vocabulary they all report a credential problem in.
 *
 * `@pops/pillar-sdk` exports two `pillar()` functions with the same name and
 * the same shape. The `/client` one is unauthenticated: a backend that
 * imports it compiles, runs, and silently sends no `X-API-Key`, which works
 * exactly until the callee starts requiring one and then fails as an
 * indistinguishable outage. Every leg here builds its handle from the
 * `/server` one, wrapped in {@link credentialled}.
 *
 * The wrapper takes a thunk rather than a pillar id, so the `pillar()` call
 * stays at the leg with its literal id and its router type. That is not
 * style: `scripts/ci/check-cross-pillar-expectations.mjs` reads those two
 * things to pin each seam to the producer's published contract, and a
 * wrapper that resolved the id itself would hide all four seams from the
 * gate behind one unresolvable call.
 *
 * The second job is telling two failures apart. "The pillar is down" and
 * "the pillar refused this pillar's credential" call for different actions —
 * wait versus fix the grant — and folding the second into the first is how a
 * nightly reconciliation becomes a permanent no-op nobody notices. So a
 * refusal carries {@link UNAUTHORIZED_REASON} and a process with no key at
 * all carries {@link NO_CREDENTIAL_REASON}, and neither is ever reported as a
 * bare `unavailable`.
 */
import { PillarServerSdkError, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  PURCHASES_SERVICE_ACCOUNT_NAME,
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
 * restart, and the callers here are a per-URI cron loop and a per-receipt
 * resolver — one line per pillar says everything a repeated one would, and a
 * per-call line would bury the leg summaries that carry the counts.
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
 *   reports {@link NO_CREDENTIAL_REASON} rather than attempting an anonymous
 *   call the callee may or may not still admit.
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
        `[purchases-api] cannot call '${pillarId}': no service-account key in this process. ` +
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
 * Names the account, so an operator reads it as "widen or restore this grant"
 * rather than "some pillar is unhappy".
 *
 * @param pillarId Registry id of the pillar that refused.
 * @param operation Dotted procedure path that was called, e.g. `items.get`.
 */
export function credentialRejectedMessage(pillarId: string, operation: string): string {
  return (
    `[purchases-api] ${pillarId} rejected this pillar's service-account credential on ` +
    `${operation} — the '${PURCHASES_SERVICE_ACCOUNT_NAME}' account is missing, revoked, or not ` +
    'granted this scope. Nothing was written; this is a credential problem, not an outage.'
  );
}

/** Test-only: forget which pillars have already been reported. */
export function __resetOutboundCredentialReports(): void {
  reportedMissingKey.clear();
}
