/**
 * The one place a {@link GatewayFailure} becomes an HTTP answer for the phone.
 *
 * The classification switch is total over every failure kind — no default arm
 * — so a kind added to the gateway fails the build here rather than falling
 * through to something plausible. The point of the gateway keeping seven kinds
 * apart is lost the moment one of them is quietly folded into another on the
 * way out.
 *
 * Two SDK-level failures never reach this switch as their own kind: the
 * pillar SDK's `refused` (a producer 4xx this SDK does not otherwise
 * recognise — 413, 422, ...) and `rate-limited` (429) both fold onto an
 * existing `GatewayFailure` kind one step earlier, in `gateway.ts`'s
 * `toGatewayFailure` — see that function's header for why a seventh and
 * eighth kind is not the fix here. What this file still guarantees for both:
 * `refused` answers `retryable: false` on a status that is not 503, and
 * `rate-limited` answers `retryable: true` with the producer's `Retry-After`
 * (when it sent one) preserved in the message rather than dropped.
 */
import type { MobileUpstreamError } from '../../contract/rest-schemas.js';
import type { GatewayFailure } from '../pillars/gateway.js';

/** The statuses the mobile transaction routes declare for an upstream fault. */
export type UpstreamErrorStatus = 404 | 502 | 503;

export interface UpstreamErrorResponse {
  readonly status: UpstreamErrorStatus;
  readonly body: MobileUpstreamError;
}

interface Classification {
  readonly status: UpstreamErrorStatus;
  readonly code: MobileUpstreamError['code'];
  readonly summary: string;
}

function classify(failure: GatewayFailure): Classification {
  const target = failure.pillar;
  switch (failure.kind) {
    case 'unavailable':
      return { status: 503, code: 'upstream_unavailable', summary: `${target} did not answer` };
    case 'degraded':
      return {
        status: 503,
        code: 'upstream_degraded',
        summary: `${target} is ${failure.reason}`,
      };
    case 'contract-mismatch':
      return {
        status: 502,
        code: 'upstream_contract_mismatch',
        summary: `${target} answered with a contract this pillar cannot call`,
      };
    case 'gateway-misconfigured':
      return {
        status: 502,
        code: 'upstream_misconfigured',
        summary: `${target} rejected this pillar's credential`,
      };
    case 'invalid-request':
      // Finance refusing a query bfm built is bfm's bug, never the app's — so
      // it is a 502 rather than the 400 the gateway's own status suggests. A
      // 400 would tell the phone to stop asking for something it asked for
      // perfectly correctly.
      return {
        status: 502,
        code: 'upstream_invalid_request',
        summary: `${target} rejected a request this pillar built`,
      };
    case 'conflict':
      return {
        status: 502,
        code: 'upstream_conflict',
        summary: `${target} reported a conflict on a read`,
      };
    case 'not-found':
      return { status: 404, code: 'not_found', summary: 'No such transaction' };
  }
}

/**
 * Retrying is worth it exactly when nobody answered, or answered mid-recovery.
 * Every other status means the request reached something that will keep giving
 * the same answer until a human changes something, and a phone retrying that
 * is a phone burning a battery on a fault it cannot affect.
 */
function isRetryable(status: UpstreamErrorStatus): boolean {
  return status === 503;
}

/**
 * Compose the operator-facing message.
 *
 * `detail` is never rendered — the app draws its own copy from `code`. It is
 * carried because a contract skew, a rejected service-account key or a
 * misrouted URL is otherwise invisible from outside this pillar's logs, and a
 * crash report is often the only place anyone will see it.
 */
function describe(summary: string, failure: GatewayFailure): string {
  return failure.detail === undefined ? summary : `${summary}: ${failure.detail}`;
}

/**
 * For a route that addresses one resource by path, where 404 is a fact about
 * the user's data and the route declares it.
 */
export function toUpstreamErrorResponse(failure: GatewayFailure): UpstreamErrorResponse {
  const { status, code, summary } = classify(failure);

  return {
    status,
    body: {
      code,
      pillar: failure.pillar,
      retryable: isRetryable(status),
      message: describe(summary, failure),
    },
  };
}

/** The subset a collection route can answer — 404 is not among them. */
export type CollectionUpstreamErrorStatus = Exclude<UpstreamErrorStatus, 404>;

export interface CollectionUpstreamErrorResponse {
  readonly status: CollectionUpstreamErrorStatus;
  readonly body: MobileUpstreamError;
}

/**
 * The same mapping for a route that addresses no single resource.
 *
 * A list has nothing to be "not found". A 404 from finance on a collection
 * means the path bfm built is not one finance serves — a contract fault, not a
 * fact about anybody's data — so it folds into the same 502 a shape mismatch
 * gets.
 *
 * The narrowed return type is the load-bearing part. A collection route does
 * not declare 404, so emitting one would put a status in the response that the
 * OpenAPI document does not carry, which means the generated Swift client has
 * no case for it: the app would meet a status it cannot decode, at runtime, on
 * a handset. `Exclude<…, 404>` makes that a compile error here instead.
 */
export function toCollectionUpstreamErrorResponse(
  failure: GatewayFailure
): CollectionUpstreamErrorResponse {
  const mapped = toUpstreamErrorResponse(failure);
  if (mapped.status !== 404) return { status: mapped.status, body: mapped.body };

  return {
    status: 502,
    body: {
      ...mapped.body,
      code: 'upstream_contract_mismatch',
      retryable: false,
      // Still through `describe`, so the gateway's detail survives the fold.
      // This is the arm where it matters most: a 404 on a collection usually
      // means a base URL pointing somewhere unexpected, and the detail is the
      // only thing that says where.
      message: describe(
        `${failure.pillar} does not serve the collection this pillar asked for`,
        failure
      ),
    },
  };
}
