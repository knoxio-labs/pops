/**
 * `device.*` sub-router — the routes a phone reaches directly.
 *
 *   - `pair`      (mutation) → `POST /devices/pair`
 *   - `challenge` (mutation) → `POST /devices/challenge`
 *   - `refresh`   (mutation) → `POST /devices/refresh`
 *
 * ## Why this is a separate sub-router from `operator`
 *
 * bfm answers on two hostnames. The shell's nginx reaches it at `/bfm-api/`
 * behind Cloudflare Access; its own tunnel hostname has Access **bypassed**
 * (POPS-1389), because a native app cannot complete a browser login. One
 * Express app serves both, so "which surface is this route on" is not
 * something the runtime can tell you — it is a property of the contract, and
 * this split is where it is written down.
 *
 * The prefix earns its keep the same way `/operator` does, in the other
 * direction: the bypassed hostname can refuse `/operator/*` wholesale at the
 * edge, which it could not do if the operator device list and the public
 * pairing route both sat under `/devices`.
 *
 * ## What guards it
 *
 * Nothing that resolves an identity — by definition. Every route here either
 * predates having a token or exists because the one the phone had is no longer
 * usable, so none of them can require presenting one. What stands in for a
 * principal is different per route, and in each case it is the credential
 * carried in the body rather than a gate in front of it:
 *
 * - **`pair`** — possession of a live pairing code. It is short enough for a
 *   human to type, so `api/auth/pairing-rate-limit.ts` bounds guessing, and
 *   the code's own ~59 bits over a five-minute life is what makes guessing
 *   pointless rather than merely slow.
 * - **`refresh`** — possession of a 256-bit refresh token AND a signature from
 *   the handset's Secure Enclave key over a nonce this server just issued.
 *   Neither half is enough alone: that is the whole point of proof of
 *   possession, and `api/auth/refresh-exchange.ts` is where it is checked.
 * - **`challenge`** — nothing at all, deliberately. It hands out a random
 *   value that is worthless without the other two. It is rate-limited because
 *   it allocates, not because the nonce is a secret.
 *
 * `/mobile/*` is a different surface with a different gate: those routes need
 * a device that already exists and a live access token, which is what `pair`
 * creates and `refresh` renews.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  DeviceInvalidRequestErrorSchema,
  PairDeviceRequestSchema,
  PairedDeviceSchema,
  PairingRejectedErrorSchema,
  RefreshChallengeSchema,
  RefreshedSessionSchema,
  RefreshErrorSchema,
  RefreshSessionRequestSchema,
} from './rest-device-schemas.js';
import { DeviceRevokedErrorSchema, RateLimitErrorSchema } from './rest-schemas.js';

const c = initContract();

export const bfmDeviceContract = c.router({
  pair: {
    method: 'POST',
    path: '/devices/pair',
    body: PairDeviceRequestSchema,
    responses: {
      201: PairedDeviceSchema,
      // A literal `code` per status, not one enum on both — see the schemas'
      // own note for why the document must not promise a combination this
      // route cannot produce.
      400: DeviceInvalidRequestErrorSchema,
      403: PairingRejectedErrorSchema,
      429: RateLimitErrorSchema,
    },
    summary: 'Spend a pairing code for a device identity. The tokens are returned once',
  },
  challenge: {
    method: 'POST',
    path: '/devices/challenge',
    // POST rather than GET, and no body. It is not idempotent — each call
    // allocates a nonce that the caller is expected to spend — so it must not
    // sit behind anything that may cache or prefetch a GET.
    body: z.object({}).optional(),
    responses: {
      201: RefreshChallengeSchema,
      429: RateLimitErrorSchema,
    },
    summary: 'Mint a single-use nonce for a refresh. Carries no credential and needs none',
  },
  refresh: {
    method: 'POST',
    path: '/devices/refresh',
    body: RefreshSessionRequestSchema,
    responses: {
      200: RefreshedSessionSchema,
      // The same reshaped body the pairing route answers with, and for the
      // same two reasons: the generated client needs a case for it, and
      // ts-rest's native validation body names this server's schema fields on
      // a route reachable from the public internet. `rest/request-validation.ts`
      // does the reshaping.
      400: DeviceInvalidRequestErrorSchema,
      // Two codes on one status, which is not the shape the routes above use.
      // `RefreshErrorSchema`'s own note says why: there `code` restated the
      // status, here both codes share 401 and select different recoveries.
      401: RefreshErrorSchema,
      403: DeviceRevokedErrorSchema,
      429: RateLimitErrorSchema,
    },
    summary: 'Rotate a refresh token, proving possession of the device key. Detects reuse',
  },
});

export type BfmDeviceContract = typeof bfmDeviceContract;
