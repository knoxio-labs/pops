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
 *   - everything else — unavailable, unauthorized, degraded, conflict, a
 *     contract mismatch. All transient or operational from this side, so
 *     the flag is left exactly as it was and retried next tick.
 *
 * `unauthorized` and `contract-mismatch` are not obviously transient, but
 * treating them as `unavailable` is the safe reading: a purchases pillar
 * that cannot authenticate to inventory knows nothing about whether the
 * item exists, and guessing "gone" would mark real references stale.
 */
import { isOk, pillar, type CallResult } from '@pops/pillar-sdk/client';

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
    case 'unavailable':
    case 'degraded':
    case 'contract-mismatch':
    case 'conflict':
      return { kind: 'unavailable', reason: result.kind };
  }
}

/** Resolve `pops://inventory/item/<id>` via `GET /items/:id` on the inventory pillar. */
export function createInventoryItemLookup(): ReconcileLookupFn {
  return async (id: string): Promise<ReconcileLookupResult> =>
    classify(await pillar<InventoryHandle>('inventory').items.get({ id }));
}

/** Resolve `pops://documents/document/<id>` via `GET /paperless/documents/:id` on the documents pillar. */
export function createDocumentLookup(): ReconcileLookupFn {
  return async (id: string): Promise<ReconcileLookupResult> =>
    classify(await pillar<DocumentsHandle>('documents').paperless.get({ id }));
}
