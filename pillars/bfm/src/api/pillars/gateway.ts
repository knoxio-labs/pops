/**
 * The one place a sibling pillar's `CallResult` becomes something bfm can put
 * in front of the phone.
 *
 * `unavailable`, `degraded` and `contract-mismatch` stay three values here and
 * all the way out. They answer three different questions — nobody answered,
 * answering but mid-recovery, answering but not with a contract we can call —
 * and the one moment this pillar earns its keep is when the federation is
 * half-broken, which is exactly when a collapsed boolean or a blanket 500 has
 * thrown away the only useful information. Anything 503 is worth retrying;
 * nothing else is.
 *
 * Nothing here throws and nothing here catches. `pillar()` already folds its
 * own discovery and OpenAPI failures into `unavailable` / `contract-mismatch`
 * and returns them as values, so an exception arriving at this layer is a
 * programming fault and must not be dressed up as an outage. `.orThrow()` is
 * the opposite bargain and is deliberately unused — no production call site in
 * the repo takes it.
 *
 * Classifying "unavailable" for bfm's OWN inbound traffic is a separate
 * concern the SDK deliberately does not own: a pillar's browser traffic goes
 * through its generated Hey API client, which the SDK never sees, and each
 * consumer keeps its own `isUnavailableError` against its own error class.
 * Nothing in this file applies to that half.
 *
 * `refused` and `rate-limited` (the SDK's buckets for a producer 4xx it does
 * not otherwise recognise, and for 429 respectively — see
 * `@pops/pillar-sdk/client`'s `errors.ts`) are DELIBERATELY the two SDK
 * failure kinds that do NOT get their own `GatewayFailure` kind here, unlike
 * every other kind this file maps. `refused` folds onto the same outcome as
 * `bad-request`; `rate-limited` folds onto `unavailable`. Giving either its
 * own kind would need its own `MobileUpstreamError.code` too
 * (`upstream-error.ts`'s `classify` has no default arm on purpose), which is
 * a wire-contract change — the OpenAPI document this pillar publishes, and
 * therefore the generated Swift client `clients/ios` vendors from it
 * (`mise run generate:bfm-client`, gated by the iOS Quality workflow). That
 * is real, valuable follow-up work (finer-grained codes let the app tell a
 * 413 from a 422 from bfm's own bad-request-forwarding bug) but it is a
 * separate, cross-repo change, not this fix. The property that DOES matter
 * for POPS-2230 survives the fold without it: a `refused` producer answer is
 * `retryable: false` and distinct in status from a genuine `unavailable`,
 * and a `rate-limited` one stays `retryable: true` with its `Retry-After`
 * preserved in `detail` rather than silently dropped.
 */
import { pillar } from '@pops/pillar-sdk/server';

import { toGatewayFailure } from './gateway-failure-mapping.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/server';

export { toGatewayFailure } from './gateway-failure-mapping.js';

type GatewayFailureBase = {
  /** The pillar that was called, by its registered id (e.g. `finance`). */
  readonly pillar: string;
  /** Operator-facing context. Never assume it is safe to show a user. */
  readonly detail?: string;
  /**
   * The producer's own error code, verbatim, when its answer carried one.
   * Lets a route distinguish two failures of the same `kind` by a stable
   * machine token instead of parsing `detail`'s free text — see
   * `toPurchaseUpdateErrorResponse`'s `purchase_locked` / `purchase_stale`
   * split.
   */
  readonly code?: string;
  /** The producer's user-safe message, when it returned an ADR-054 envelope. */
  readonly message?: string;
  /** The producer's structured diagnostics, when present. */
  readonly details?: Readonly<Record<string, unknown>>;
  /** The producer's request id, preserved across the relay. */
  readonly requestId?: string;
  /** The producer's retry decision, preserved across the relay. */
  readonly retryable?: boolean;
  /** The producer status before BFM maps it to a status declared by its mobile route. */
  readonly upstreamStatus?: number;
};

/**
 * bfm's own failure vocabulary. Each member carries the status the mobile
 * surface should answer with, so the mapping lives here once instead of being
 * re-derived — and re-diverging — at every endpoint.
 */
export type GatewayFailure =
  | (GatewayFailureBase & { readonly kind: 'unavailable'; readonly status: 503 })
  | (GatewayFailureBase & {
      readonly kind: 'degraded';
      readonly reason: 'reconciling';
      readonly status: 503;
    })
  | (GatewayFailureBase & { readonly kind: 'contract-mismatch'; readonly status: 502 })
  | (GatewayFailureBase & { readonly kind: 'not-found'; readonly status: 404 })
  | (GatewayFailureBase & { readonly kind: 'conflict'; readonly status: 409 })
  | (GatewayFailureBase & { readonly kind: 'invalid-request'; readonly status: 400 })
  /**
   * The producer answered, understood the request, and will not represent the
   * resource in the form asked for — a receipt that is a PDF rather than a
   * photograph, asked for as an image.
   *
   * Its own kind rather than folded into `invalid-request` because it is the
   * one producer 4xx that is a fact about the RESOURCE instead of about the
   * request bfm built. Folded, it would reach the phone as "this pillar built
   * a bad request", and the app would keep asking for a picture that will
   * never exist rather than drawing a placeholder once.
   */
  | (GatewayFailureBase & { readonly kind: 'unsupported-media'; readonly status: 415 })
  | (GatewayFailureBase & { readonly kind: 'gateway-misconfigured'; readonly status: 502 })
  /**
   * This pillar's own `Pops-Inventory-Protocol` is below the inventory
   * pillar's current minimum — a real HTTP status, `426`, that sits outside
   * `@ts-rest/core`'s `HTTPStatusCode` union (`response-error.ts`), so it can
   * never be a ts-rest handler's typed return value. Its `status` field
   * exists for symmetry with every other member; the route that actually
   * answers 426 throws `InventoryProtocolTooOldError` instead of switching on
   * this kind through the normal `upstream-error.ts` path — see
   * `api/inventory/protocol-error.ts`.
   */
  | (GatewayFailureBase & { readonly kind: 'protocol-too-old'; readonly status: 426 });

export type GatewaySuccess<TValue> = { readonly kind: 'ok'; readonly value: TValue };

export type GatewayOutcome<TValue> = GatewaySuccess<TValue> | GatewayFailure;

/** Narrow an outcome to its success arm. */
export function isGatewayOk<TValue>(
  outcome: GatewayOutcome<TValue>
): outcome is GatewaySuccess<TValue> {
  return outcome.kind === 'ok';
}

/**
 * How a handle is obtained. Defaults to the authenticated `/server` factory;
 * tests substitute a stub so the mapping is exercised without a network.
 */
export type PillarHandleFactory = <TRouter>(pillarId: string) => PillarHandle<TRouter>;

export interface PillarGateway {
  /**
   * Run one call against `pillarId` and translate its result.
   *
   * @param invoke Receives the handle and returns the SDK call. Awaited here,
   *   so the failure discriminant cannot be dropped by a floating promise.
   */
  call<TRouter, TValue>(
    pillarId: string,
    invoke: (handle: PillarHandle<TRouter>) => Promise<CallResult<TValue>>
  ): Promise<GatewayOutcome<TValue>>;
}

export function createPillarGateway(handleFactory: PillarHandleFactory = pillar): PillarGateway {
  return {
    call: async <TRouter, TValue>(
      pillarId: string,
      invoke: (handle: PillarHandle<TRouter>) => Promise<CallResult<TValue>>
    ): Promise<GatewayOutcome<TValue>> => {
      const result = await invoke(handleFactory<TRouter>(pillarId));
      return result.kind === 'ok' ? { kind: 'ok', value: result.value } : toGatewayFailure(result);
    },
  };
}
