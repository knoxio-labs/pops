/**
 * `operator.*` sub-router — pairing-code issuance and the device allow-list.
 *
 *   - `issuePairingCode` (mutation) → `POST   /operator/pairing/codes`
 *   - `listDevices`      (query)    → `GET    /operator/devices`
 *   - `revokeDevice`     (mutation) → `DELETE /operator/devices/:id`
 *
 * ## Why `/operator`
 *
 * bfm answers on two hostnames. The shell's nginx reaches it at `/bfm-api/`
 * behind Cloudflare Access; its own tunnel hostname has Access **bypassed**,
 * because the phone has to reach `POST /devices/pair` and
 * `POST /devices/refresh` without an Access session. One Express app serves
 * both.
 *
 * So these three routes are reachable from the public internet, and the
 * `requireOperator` gate in their handlers is the actual perimeter. The prefix
 * does not add security by itself — it makes a second layer *expressible*: the
 * bypassed hostname can refuse `/operator/*` wholesale at the edge
 * (POPS-1389), which it could not do if the operator device list and the
 * public pairing route both sat under `/devices`.
 *
 * Nothing here is a cross-pillar surface. It is consumed by the Devices page
 * (POPS-1387) and by nothing else.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import {
  DeviceListSchema,
  ErrorBodySchema,
  IssuedPairingCodeSchema,
  OPERATOR_ERR_RESPONSES,
  RevokedDeviceSchema,
} from './rest-operator-schemas.js';

const c = initContract();

export const bfmOperatorContract = c.router({
  issuePairingCode: {
    method: 'POST',
    path: '/operator/pairing/codes',
    body: z.object({}).optional(),
    responses: {
      201: IssuedPairingCodeSchema,
      ...OPERATOR_ERR_RESPONSES,
      429: ErrorBodySchema,
    },
    summary: 'Mint a single-use pairing code. The plaintext is returned once and never again',
  },
  listDevices: {
    method: 'GET',
    path: '/operator/devices',
    responses: {
      200: DeviceListSchema,
      ...OPERATOR_ERR_RESPONSES,
    },
    summary: 'List paired devices, revoked ones included. Never returns a token or a key',
  },
  revokeDevice: {
    method: 'DELETE',
    path: '/operator/devices/:id',
    pathParams: z.object({ id: z.string().min(1) }),
    responses: {
      200: RevokedDeviceSchema,
      ...OPERATOR_ERR_RESPONSES,
      404: ErrorBodySchema,
    },
    summary: 'Soft-revoke a device and kill its refresh-token family in one transaction',
  },
});

export type BfmOperatorContract = typeof bfmOperatorContract;
