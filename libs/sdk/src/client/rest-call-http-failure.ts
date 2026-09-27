/**
 * Mapping a non-2xx REST response to a {@link CallFailure}. Split out of
 * `rest-call.ts`, which the pillar's own line cap otherwise reddens — one
 * status table, not a second copy of the transport.
 */
import { parseRetryAfterSeconds } from './retry-after.js';

import type { CallFailure } from './errors.js';

/**
 * Map a non-2xx REST response to a {@link CallFailure}.
 *
 * The collapsed pillars return a `{ message, code? }` envelope for the mapped
 * statuses (see `pillars/*\/src/api/rest/error-mapping.ts`): 400 → bad-request,
 * 401 and 403 → unauthorized, 404 → not-found, 409 → conflict, 429 →
 * rate-limited, 408 and 425 → unavailable (see the case for why). Everything
 * else falls to the default arm, bucketed by whether the status is a client
 * or a server error — see that arm for why.
 *
 * 403 belongs with 401 rather than in the `unavailable` bucket because it is
 * the answer the inbound service-account gate gives a live key whose grant
 * does not cover the operation (ADR-044) — the likeliest way a cross-pillar
 * call fails once a producer requires a credential. Reported as `unavailable`
 * it reads as a peer being down, so a caller waits for an outage to pass
 * where the fix is widening a grant, and best-effort callers swallow it
 * entirely.
 *
 * Every other 4xx this function has seen a name for was checked against its
 * defining RFC before being left in the default (permanent) arm rather than
 * given a case here:
 *
 * - 405 Method Not Allowed, 406 Not Acceptable, 410 Gone, 411 Length
 *   Required, 412 Precondition Failed, 414 URI Too Long, 415 Unsupported
 *   Media Type, 416 Range Not Satisfiable, 417 Expectation Failed, 422
 *   Unprocessable Content — none of these change on an unmodified retry.
 * - 423 Locked and 424 Failed Dependency (RFC 4918 §§11.3–11.4, WebDAV) have
 *   no RFC text promising the same request later succeeds unmodified — 423
 *   describes a lock that MAY clear, not one the client is told will; 424
 *   depends on a sibling request in the same batch, not on time passing.
 *   Folding either into `unavailable` on a hope is the same mistake this
 *   function's header warns about, so both stay `refused`. Neither pillar in
 *   this repo emits WebDAV statuses today.
 * - 449 (non-standard, "Retry With") explicitly asks for a MODIFIED retry —
 *   the opposite of what `unavailable`/`rate-limited` promise a caller
 *   (retry the SAME request later). `refused` is the correct permanent
 *   reading: this exact request will not succeed by itself.
 */
export function mapHttpFailure(
  pillarId: string,
  status: number,
  body: unknown,
  headers: Headers
): CallFailure {
  const metadata = extractErrorMetadata(body, headers);
  const known = mapKnownFailure(pillarId, status, metadata, headers);
  if (known !== undefined) return known;

  // A status this function does not otherwise recognise. An unmapped 4xx is
  // permanent; a 5xx is the only signal available here that the producer is
  // in trouble and the same request may succeed later.
  return status >= 500
    ? withDetails({ kind: 'unavailable', pillar: pillarId }, metadata)
    : withDetails({ kind: 'refused', pillar: pillarId, status }, metadata);
}

type ErrorMetadata = {
  readonly message?: string;
  readonly code?: string;
  readonly details?: Record<string, unknown>;
  readonly requestId?: string;
  readonly retryable?: boolean;
};

function mapKnownFailure(
  pillarId: string,
  status: number,
  metadata: ErrorMetadata,
  headers: Headers
): CallFailure | undefined {
  switch (status) {
    case 400:
      return withDetails({ kind: 'bad-request', pillar: pillarId }, metadata);
    case 401:
    case 403:
      return withDetails({ kind: 'unauthorized', pillar: pillarId }, metadata);
    case 404:
      return withDetails({ kind: 'not-found', pillar: pillarId }, metadata);
    case 409:
      return withDetails({ kind: 'conflict', pillar: pillarId }, metadata);
    case 408:
    case 425:
      return { kind: 'unavailable', pillar: pillarId };
    case 429:
      return withDetails(
        {
          kind: 'rate-limited',
          pillar: pillarId,
          retryAfterSeconds: parseRetryAfterSeconds(headers),
        },
        metadata
      );
    default:
      return undefined;
  }
}

type FailureWithDetails = Extract<
  CallFailure,
  {
    kind:
      | 'unavailable'
      | 'not-found'
      | 'conflict'
      | 'bad-request'
      | 'unauthorized'
      | 'refused'
      | 'rate-limited';
  }
>;

/** Attach the producer's message, code, and remaining structured diagnostics when sent. */
function withDetails<T extends FailureWithDetails>(failure: T, metadata: ErrorMetadata): T {
  return {
    ...failure,
    ...(metadata.message ? { message: metadata.message } : {}),
    ...(metadata.code ? { code: metadata.code } : {}),
    ...(metadata.details ? { details: metadata.details } : {}),
    ...(metadata.requestId ? { requestId: metadata.requestId } : {}),
    ...(metadata.retryable === undefined ? {} : { retryable: metadata.retryable }),
  };
}

function extractErrorMetadata(body: unknown, headers: Headers): ErrorMetadata {
  return {
    message: extractErrorMessage(body),
    code: extractErrorCode(body),
    details: extractErrorDetails(body),
    requestId: extractErrorRequestId(body) ?? headers.get('X-Request-Id') ?? undefined,
    retryable: extractErrorRetryable(body),
  };
}

function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const message = (body as Record<string, unknown>)['message'];
  return typeof message === 'string' ? message : undefined;
}

/** The producer's error `code`, from the same `{ message, code? }` envelope. */
function extractErrorCode(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const code = (body as Record<string, unknown>)['code'];
  return typeof code === 'string' ? code : undefined;
}

function extractErrorDetails(body: unknown): Record<string, unknown> | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const bodyRecord = body as Record<string, unknown>;
  const envelopeDetails = bodyRecord['details'];
  if (isRecord(envelopeDetails)) return envelopeDetails;
  const entries = Object.entries(bodyRecord).filter(
    ([key]) => !['message', 'code', 'requestId', 'retryable'].includes(key)
  );
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

function extractErrorRequestId(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const requestId = (body as Record<string, unknown>)['requestId'];
  return typeof requestId === 'string' ? requestId : undefined;
}

function extractErrorRetryable(body: unknown): boolean | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const retryable = (body as Record<string, unknown>)['retryable'];
  return typeof retryable === 'boolean' ? retryable : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
