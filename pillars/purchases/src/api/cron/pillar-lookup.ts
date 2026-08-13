/**
 * Production adapters wiring {@link ReconcileLookupFn} to the pillar SDK
 * proxy, one per soft-URI leg.
 *
 * Kept out of the worker so its unit tests can drive the reconciliation
 * logic with stubs and never touch the HTTP transport — the same split
 * `pillars/finance/src/api/cron/pillar-lookup.ts` uses.
 *
 * Both adapters do the same job: call the owning pillar's get-by-id route
 * and fold the SDK's {@link CallResult} discriminants down to the cron's
 * smaller vocabulary. The mapping is where the correctness lives:
 *
 *   - `not-found` (HTTP 404) — the pillar asserts the row is gone. The ONLY
 *     outcome that stamps `staleAt`.
 *   - `bad-request` (HTTP 400) — the id is malformed for that pillar (a
 *     non-numeric Paperless id, say). Ops-visible; the row is preserved,
 *     because a bad reference is a data problem to look at rather than a
 *     resolution failure to record.
 *   - `unauthorized` (HTTP 401/403) — the callee refused this pillar's
 *     service-account credential. Ops-visible and counted separately,
 *     because it will not clear on its own: it wants a grant widened or an
 *     account restored, not a retry. The row is preserved.
 *   - everything else — unavailable, degraded, conflict, a contract
 *     mismatch. All transient or operational from this side, so the flag is
 *     left exactly as it was and retried next tick.
 *
 * `contract-mismatch` is not obviously transient, but treating it as
 * `unavailable` is the safe reading: a purchases pillar that cannot address
 * inventory knows nothing about whether the item exists, and guessing "gone"
 * would mark real references stale. That reasoning is what kept
 * `unauthorized` here too, until purchases started sending a credential —
 * one that is refused is now a fact about this pillar's own configuration
 * and is reported as such.
 */
import { isOk, type CallResult, type PillarHandle } from '@pops/pillar-sdk/server';

import {
  credentialledPillar,
  NO_CREDENTIAL_REASON,
  UNAUTHORIZED_REASON,
} from '../pillars/outbound.js';

import type { ReconcileLookupFn, ReconcileLookupResult } from './reconcile-cross-pillar.js';

type InventoryHandle = {
  items: {
    get: (input: { id: string }) => Promise<CallResult<unknown>>;
  };
};

type DocumentsHandle = {
  paperless: {
    get: (input: { id: string }) => Promise<CallResult<unknown>>;
  };
};

function classify(result: CallResult<unknown>): ReconcileLookupResult {
  if (isOk(result)) return { kind: 'ok' };
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
      return { kind: 'unavailable', reason: result.kind };
  }
}

/**
 * One leg's adapter: resolve a credentialled handle per call, then fold the
 * answer.
 *
 * The handle is built per call rather than once at construction because
 * `pillar()` from `@pops/pillar-sdk/server` refuses to build one without a
 * service-account key — constructing eagerly would move a missing key from a
 * degraded cron to a pillar that will not boot.
 *
 * @param pillarId Registry id of the pillar that owns the reference.
 * @param call Issues the get-by-id request against that pillar's handle.
 */
function lookupVia<THandle>(
  pillarId: string,
  call: (handle: PillarHandle<THandle>, id: string) => Promise<CallResult<unknown>>
): ReconcileLookupFn {
  return async (id: string): Promise<ReconcileLookupResult> => {
    const handle = credentialledPillar<THandle>(pillarId);
    if (handle === null) return { kind: 'unauthorized', reason: NO_CREDENTIAL_REASON };
    return classify(await call(handle, id));
  };
}

/** Resolve `pops://inventory/item/<id>` via `GET /items/:id` on the inventory pillar. */
export function createInventoryItemLookup(): ReconcileLookupFn {
  return lookupVia<InventoryHandle>('inventory', (handle, id) => handle.items.get({ id }));
}

/** Resolve `pops://documents/document/<id>` via `GET /paperless/documents/:id` on the documents pillar. */
export function createDocumentLookup(): ReconcileLookupFn {
  return lookupVia<DocumentsHandle>('documents', (handle, id) => handle.paperless.get({ id }));
}
