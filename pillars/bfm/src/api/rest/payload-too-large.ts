/**
 * The body parser's refusal, reshaped for the phone.
 *
 * `express.json` rejects an oversized body before any route matches, by
 * throwing an error the default handler renders as an HTML page with a `413`.
 * On this surface that is worse than useless: the iOS client is generated from
 * the contract, so a response whose body is not the declared shape is one it
 * decodes as a failure of the app rather than a refusal it can explain — and
 * the whole reason bfm caps the body itself (ADR-046) is to answer this in
 * terms the caller can act on rather than forwarding it and letting the pillar
 * behind decide.
 *
 * Only `/mobile` is reshaped. The operator and device surfaces declare no 413
 * and are not reached by a generated client, so quietly changing what they
 * answer is not this handler's business.
 */
import { MOBILE_UPLOAD_MAX_BYTES } from '../../contract/rest-schemas.js';
import { MOBILE_PATH_PREFIX } from '../paths.js';

import type { MobilePayloadTooLargeError } from '../../contract/rest-schemas.js';

/** All this handler reads off the request. */
type PathOnlyRequest = { readonly path: string };

/**
 * All this handler does to the response, declared structurally for the same
 * reason the request is: express's own `Response` carries a hundred members a
 * test double would have to fake to satisfy the compiler, and faking them is
 * how a test ends up asserting against a stub rather than the handler.
 */
type JsonResponse = { status: (code: number) => { json: (body: unknown) => unknown } };

/**
 * The one call this handler makes into express's chain. Declared structurally
 * rather than as `NextFunction`, whose `'route' | 'router'` overload nothing
 * here uses and no test double can express.
 */
type PassToNext = (error?: unknown) => void;

/**
 * body-parser's own discriminant. It sets `type` on the error it throws, and
 * `entity.too.large` is the one that means the body exceeded `limit` — as
 * opposed to `entity.parse.failed`, which is malformed JSON and is a `400`.
 */
const TOO_LARGE_TYPE = 'entity.too.large';

function isPayloadTooLarge(error: unknown): boolean {
  if (typeof error !== 'object' || error === null || !('type' in error)) return false;
  return error.type === TOO_LARGE_TYPE;
}

function isUnderMobilePrefix(path: string): boolean {
  return path === MOBILE_PATH_PREFIX || path.startsWith(`${MOBILE_PATH_PREFIX}/`);
}

/**
 * The ceiling the parser that refused this request was actually mounted with.
 *
 * Read off the error rather than assumed, because two parsers cover `/mobile`:
 * the upload path's raised limit, and Express's 100kb default on everything
 * else. Reporting {@link MOBILE_UPLOAD_MAX_BYTES} unconditionally would tell a
 * caller refused at 100kb that it may send twelve megabytes — a number it
 * would then obey, and be refused at again.
 *
 * body-parser sets `limit` to the resolved byte count. A version that stopped,
 * or a `413` thrown by something else entirely, falls back to the mount this
 * pillar owns: an approximate ceiling beats an absent field the client's
 * schema requires.
 */
function refusedAt(error: unknown): number {
  if (typeof error !== 'object' || error === null || !('limit' in error)) {
    return MOBILE_UPLOAD_MAX_BYTES;
  }
  const { limit } = error;
  return typeof limit === 'number' && Number.isInteger(limit) && limit > 0
    ? limit
    : MOBILE_UPLOAD_MAX_BYTES;
}

function payloadTooLarge(error: unknown): MobilePayloadTooLargeError {
  return {
    code: 'payload_too_large',
    maxBytes: refusedAt(error),
    message: 'This upload is larger than the server accepts. Send fewer or smaller parts.',
  };
}

export function createPayloadTooLargeErrorHandler() {
  return (error: unknown, req: PathOnlyRequest, res: JsonResponse, next: PassToNext): void => {
    if (!isPayloadTooLarge(error) || !isUnderMobilePrefix(req.path)) {
      next(error);
      return;
    }

    res.status(413).json(payloadTooLarge(error));
  };
}
