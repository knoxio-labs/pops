import { z } from 'zod';

import {
  MobileForbiddenErrorSchema,
  MobileInvalidTokenErrorSchema,
  MobileRequestErrorSchema,
  MobileUpstreamErrorSchema,
  RateLimitErrorSchema,
} from './rest-schemas.js';

/**
 * The three the `/mobile` perimeter answers itself, before any handler runs —
 * the rate limiter, then `requireDevice`, then `requireCapability`, all
 * mounted on the prefix in `app.ts`.
 *
 * Declared on every route anyway. The phone switches on all of them and they
 * select four different recoveries — back off and retry unchanged, refresh the
 * access token, return to pairing and wipe the keychain, or stop offering the
 * feature — so they belong in the document the phone's client is generated
 * from. A status the document omits is a status that client has no case for.
 */
export const MOBILE_PERIMETER_RESPONSES = {
  // A literal `code` per status rather than one enum across them. The code
  // restates the status by design, so sharing a schema would have the document
  // promise a `401 device_revoked` the guard cannot produce and make every
  // generated client branch on it. The 403 is a union rather than one schema
  // for the opposite reason: two refusals genuinely share that status and do
  // not share a shape. `require-device.ts` and `require-capability.ts` pair
  // status with body at the point the response is built, which is the half a
  // schema cannot enforce.
  401: MobileInvalidTokenErrorSchema,
  403: MobileForbiddenErrorSchema,
  429: RateLimitErrorSchema,
} as const;

/**
 * The request itself was wrong. Declared on every mobile route rather than
 * only the ones with a query to get wrong: ts-rest rejects contract-level
 * validation failures before a handler runs, so any route can answer 400 the
 * moment it grows a validated input, and `app.ts` reshapes those into this
 * schema so the wire never carries a 400 the document does not describe.
 */
export const MOBILE_REQUEST_RESPONSES = {
  400: MobileRequestErrorSchema,
} as const;

/**
 * A pillar behind bfm could not serve the request. Both statuses carry the
 * same shape and are told apart by it: 503 is worth retrying, 502 is not.
 */
export const MOBILE_UPSTREAM_RESPONSES = {
  502: MobileUpstreamErrorSchema,
  503: MobileUpstreamErrorSchema,
} as const;

/**
 * Page size. Capped well below what a scroll would ever render at once —
 * bfm's whole premise is that the phone is on cellular, and a caller asking
 * for a thousand rows is asking for a screen it cannot draw.
 */
export const MobilePageLimit = z.coerce.number().int().positive().max(100).optional();
