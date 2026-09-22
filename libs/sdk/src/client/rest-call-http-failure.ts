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
  const message = extractErrorMessage(body);
  const code = extractErrorCode(body);
  switch (status) {
    case 400:
      return withDetails({ kind: 'bad-request', pillar: pillarId }, message, code);
    case 401:
    case 403:
      return withDetails({ kind: 'unauthorized', pillar: pillarId }, message, code);
    case 404:
      return withDetails({ kind: 'not-found', pillar: pillarId }, message, code);
    case 409:
      return withDetails({ kind: 'conflict', pillar: pillarId }, message, code);
    case 408:
    case 425:
      // 408 Request Timeout (RFC 9110 §15.5.9): "the client MAY repeat the
      // request without modification at any later time." 425 Too Early (RFC
      // 8470 §5.2): the server is asking for a retry once the TLS handshake
      // has completed. Both are the retryable half of 4xx, not the permanent
      // half the default arm buckets unmapped 4xx into — landing either in
      // `refused` reads a definitionally-transient status as a producer
      // refusal that will repeat forever. Neither carries semantics closer
      // to `rate-limited` (no producer-chosen delay to honour), so they fold
      // onto `unavailable`, same as an outage: worth retrying, no schedule.
      return { kind: 'unavailable', pillar: pillarId };
    case 429:
      return withDetails(
        {
          kind: 'rate-limited',
          pillar: pillarId,
          retryAfterSeconds: parseRetryAfterSeconds(headers),
        },
        message,
        code
      );
    default:
      // A status this function does not otherwise recognise. The two families
      // behave oppositely on retry, so folding both into one bucket is wrong
      // in one direction no matter which bucket is picked — and folding into
      // `unavailable` (retryable) is the DANGEROUS direction for an unmapped
      // 4xx: a permanent producer refusal (413 body too large, 422 the
      // payload's data is bad, 405 the method is wrong, ...) then reads as an
      // outage, and a caller retries something that will never succeed.
      // `>= 500` is the only signal this function has for "the producer
      // itself is in trouble, try again" without hardcoding every 5xx it has
      // never seen a real one of; unmapped `4xx` is `refused` — permanent,
      // carrying the real status so a caller that wants finer-grained
      // handling still can.
      return status >= 500
        ? { kind: 'unavailable', pillar: pillarId }
        : withDetails({ kind: 'refused', pillar: pillarId, status }, message, code);
  }
}

type FailureWithDetails = Extract<
  CallFailure,
  { kind: 'not-found' | 'conflict' | 'bad-request' | 'unauthorized' | 'refused' | 'rate-limited' }
>;

/** Attach the producer's `message` and `code`, when either was sent. */
function withDetails<T extends FailureWithDetails>(
  failure: T,
  message: string | undefined,
  code: string | undefined
): T {
  return {
    ...failure,
    ...(message ? { message } : {}),
    ...(code ? { code } : {}),
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
