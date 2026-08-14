/**
 * Thrown by `.orThrow()` when the underlying call did not resolve to
 * `{ kind: 'ok' }`. Carries the failure result for inspection.
 */
export class PillarCallError extends Error {
  override readonly name = 'PillarCallError';
  readonly pillarId: string;
  readonly result: CallFailure;

  constructor(pillarId: string, result: CallFailure) {
    super(`pillar('${pillarId}') call failed: ${result.kind}`);
    this.pillarId = pillarId;
    this.result = result;
  }
}

/**
 * Thrown for a hard runtime error caller code couldn't reasonably handle —
 * e.g. the SDK tried to read the discovery transport and it returned a
 * non-conforming shape. This is *not* used for `unavailable` / `degraded`
 * / `contract-mismatch`; those are returned as `CallResult` discriminants
 * so the caller can branch on them.
 *
 * When raised from an HTTP discovery read, {@link PillarSdkError.status} carries
 * the response status so the slash-first path resolver can distinguish a 404
 * (unknown path → fall back to the legacy path) from a 5xx (registry is up but
 * broken → surface the error without falling back).
 */
export class PillarSdkError extends Error {
  override readonly name = 'PillarSdkError';
  /** HTTP status of the failed discovery read, when the error originated from one. */
  readonly status: number | undefined;
  constructor(message: string, options?: { cause?: unknown; status?: number }) {
    super(message, options);
    this.status = options?.status;
  }
}

export type CallSuccess<T> = { kind: 'ok'; value: T };

/**
 * `refused` and `rate-limited` are the two "producer answered with a status
 * this SDK does not special-case" outcomes (see `rest-call.ts`'s
 * `mapHttpFailure`). They stay apart because a caller acts on them
 * oppositely: `refused` is a 4xx the producer will give the same answer to
 * every time (413, 422, 405, ...) — retrying it burns a round trip for
 * nothing, so it is never `unavailable`. `rate-limited` is specifically 429 —
 * retryable, but on the producer's schedule (`retryAfterSeconds`, parsed from
 * `Retry-After` when the producer sent one) rather than a caller's guess.
 */
export type CallFailure =
  | { kind: 'unavailable'; pillar: string }
  | { kind: 'degraded'; pillar: string; reason: 'reconciling' }
  | {
      kind: 'contract-mismatch';
      pillar: string;
      expected?: string;
      actual?: string;
      message?: string;
    }
  | { kind: 'not-found'; pillar: string; message?: string }
  | { kind: 'conflict'; pillar: string; message?: string }
  | { kind: 'bad-request'; pillar: string; message?: string }
  | { kind: 'unauthorized'; pillar: string; message?: string }
  | { kind: 'refused'; pillar: string; status: number; message?: string }
  | { kind: 'rate-limited'; pillar: string; retryAfterSeconds?: number; message?: string };

export type CallResult<T> = CallSuccess<T> | CallFailure;

export function isOk<T>(result: CallResult<T>): result is CallSuccess<T> {
  return result.kind === 'ok';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `not-found` discriminant. Maps to HTTP 404 / tRPC `NOT_FOUND`.
 *
 * Replaces the older `err.result.kind === 'contract-mismatch'` check
 * which conflated "the addressed resource does not exist" with "the
 * pillar does not implement this procedure". `contract-mismatch` is now
 * reserved for genuine SDK ↔ pillar version skew.
 */
export function isNotFound(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'not-found' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'not-found';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `conflict` discriminant. Maps to HTTP 409 / tRPC `CONFLICT`.
 */
export function isConflict(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'conflict' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'conflict';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `bad-request` discriminant. Maps to HTTP 400 / tRPC `BAD_REQUEST`.
 */
export function isBadRequest(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'bad-request' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'bad-request';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `unauthorized` discriminant. Maps to HTTP 401 / tRPC `UNAUTHORIZED`.
 */
export function isUnauthorized(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'unauthorized' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'unauthorized';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `refused` discriminant — a 4xx the producer will answer the same way on
 * every retry. Maps to HTTP 413/422/405/... (anything not already given its
 * own kind).
 */
export function isRefused(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'refused' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'refused';
}

/**
 * True when `err` is a `PillarCallError` whose failure result has the
 * `rate-limited` discriminant. Maps to HTTP 429.
 */
export function isRateLimited(err: unknown): err is PillarCallError & {
  result: Extract<CallFailure, { kind: 'rate-limited' }>;
} {
  return err instanceof PillarCallError && err.result.kind === 'rate-limited';
}
