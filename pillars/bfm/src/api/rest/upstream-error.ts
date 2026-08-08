/**
 * The one place a {@link GatewayFailure} becomes an HTTP answer for the phone.
 *
 * The classification switch is total over every failure kind — no default arm
 * — so a kind added to the gateway fails the build here rather than falling
 * through to something plausible. The point of the gateway keeping seven kinds
 * apart is lost the moment one of them is quietly folded into another on the
 * way out.
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

export function toUpstreamErrorResponse(failure: GatewayFailure): UpstreamErrorResponse {
  const { status, code, summary } = classify(failure);

  // `detail` is operator-facing and never rendered — the app draws its own
  // copy from `code`. It is carried because a contract skew or a rejected
  // service-account key is otherwise invisible from outside this pillar's logs.
  const message = failure.detail === undefined ? summary : `${summary}: ${failure.detail}`;

  return {
    status,
    body: { code, pillar: failure.pillar, retryable: isRetryable(status), message },
  };
}
