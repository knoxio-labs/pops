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
import { toGatewayFailure } from './gateway-failure-mapping.js';
import { pillarForDevice } from './handle-factory.js';

import type { CallResult, PillarHandle } from '@pops/pillar-sdk/server';

import type { GatewayOutcome } from './gateway-types.js';

export { toGatewayFailure } from './gateway-failure-mapping.js';

export {
  isGatewayOk,
  type GatewayFailure,
  type GatewayOutcome,
  type GatewaySuccess,
} from './gateway-types.js';

/**
 * How a handle is obtained. Defaults to the authenticated `/server` factory,
 * with the finance handle naming a guest device's email (`handle-factory.ts`);
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

export function createPillarGateway(
  handleFactory: PillarHandleFactory = pillarForDevice
): PillarGateway {
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
