/**
 * `device.*` sub-router — the routes a phone reaches directly.
 *
 *   - `pair` (mutation) → `POST /devices/pair`
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
 * Nothing that resolves an identity — by definition. A phone arriving here has
 * no Access session, no device row and no token; possession of a valid pairing
 * code is the entire credential. Two things stand in for a principal:
 *
 * - a per-source request budget in `api/auth/pairing-rate-limit.ts`, mounted
 *   ahead of the body parser, because a code short enough to read off a screen
 *   is short enough to guess if the attempt rate is unbounded;
 * - the code's own ~59 bits and five-minute life, which is what makes the
 *   guessing pointless rather than merely slow.
 *
 * `/mobile/*` is a different surface with a different gate: those routes need
 * a device that already exists, which is what this one creates.
 */
import { initContract } from '@ts-rest/core';

import {
  PairDeviceRequestSchema,
  PairedDeviceSchema,
  PairingErrorSchema,
} from './rest-device-schemas.js';
import { RateLimitErrorSchema } from './rest-schemas.js';

const c = initContract();

export const bfmDeviceContract = c.router({
  pair: {
    method: 'POST',
    path: '/devices/pair',
    body: PairDeviceRequestSchema,
    responses: {
      201: PairedDeviceSchema,
      400: PairingErrorSchema,
      403: PairingErrorSchema,
      429: RateLimitErrorSchema,
    },
    summary: 'Spend a pairing code for a device identity. The tokens are returned once',
  },
});

export type BfmDeviceContract = typeof bfmDeviceContract;
