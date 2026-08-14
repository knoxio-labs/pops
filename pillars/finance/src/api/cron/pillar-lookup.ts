/**
 * Production adapter that wires the {@link ReconcileLookupFn} contract to
 * the pillar SDK proxy. Calls `pillar('registry').users.get({ uri })` and
 * folds the {@link CallResult} discriminants down to the cron's smaller
 * vocabulary (`ok` / `not-found` / `bad-uri` / `unauthorized` / `unavailable`).
 *
 * The wire shape is URI-in / URI-out — input `{ uri }`, output
 * `{ data: { uri } }`. Both the inventory and finance crons go through the
 * same `registry.users.get` and pass the URI through end-to-end.
 *
 * Kept separate from the worker so unit tests can wire a stub directly
 * without exercising the HTTP transport.
 *
 * `/server`, not `/client`. The handle is built per call, not once at
 * module load: `pillar()` from `@pops/pillar-sdk/server` refuses to build
 * one without a service-account key, and constructing eagerly would move a
 * missing key from a degraded cron to a pillar that will not boot.
 */
import { isOk, pillar, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import { credentialled, NO_CREDENTIAL_REASON, UNAUTHORIZED_REASON } from '../pillars/outbound.js';

import type { ReconcileLookupFn, ReconcileLookupResult } from './reconcile-cross-pillar.js';

const REGISTRY_PILLAR_ID = 'registry';

type UsersGetResponse = { data: { uri: string } };

/**
 * Bare wire shape, not `Promise<CallResult<...>>` — the SDK proxy wraps a
 * router type's declared return in `CallResult` itself. Declaring it here
 * too would type-check (`unknown` output types swallow the mismatch) or
 * silently double-wrap for a narrower one; `UsersGetResponse` is narrow
 * enough that TS catches it either way.
 */
type CoreUsersHandle = {
  users: {
    get: (input: { uri: string }) => Promise<UsersGetResponse>;
  };
};

function classify(result: CallResult<UsersGetResponse>): ReconcileLookupResult {
  if (isOk(result)) {
    return { kind: 'ok' };
  }
  switch (result.kind) {
    case 'not-found':
      return { kind: 'not-found' };
    case 'bad-request':
      return { kind: 'bad-uri', reason: result.message ?? 'bad-request' };
    case 'unauthorized':
      return { kind: 'unauthorized', reason: UNAUTHORIZED_REASON };
    case 'unavailable':
    case 'degraded':
    case 'contract-mismatch':
    case 'conflict':
    // `refused` is a permanent producer-side refusal, but not one this
    // adapter has a specific reading for the way it does `bad-request`
    // (malformed uri) — guessing which is wrong more often than treating it
    // like everything else here: preserve the row, retry next tick.
    // `rate-limited` is genuinely transient and belongs in this bucket on
    // its own terms.
    case 'refused':
    case 'rate-limited':
      return { kind: 'unavailable', reason: result.kind };
  }
}

export function createPillarOwnerUriLookup(): ReconcileLookupFn {
  return async (uri: string): Promise<ReconcileLookupResult> => {
    const handle: PillarHandle<CoreUsersHandle> | null = credentialled(REGISTRY_PILLAR_ID, () =>
      pillar<CoreUsersHandle>(REGISTRY_PILLAR_ID)
    );
    if (handle === null) return { kind: 'unauthorized', reason: NO_CREDENTIAL_REASON };
    return classify(await handle.users.get({ uri }));
  };
}
