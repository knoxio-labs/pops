/**
 * REST contract for the bfm pillar — ts-rest single source of truth.
 *
 * `generateOpenApi(bfmContract, …)` projects this to
 * `openapi/bfm.openapi.json`, which the pillar serves verbatim at
 * `GET /openapi`. Nothing else in the tree describes the bfm wire format:
 * don't hand-author OpenAPI, and don't hand-author paths in `app.ts`.
 * Three surfaces live here, on two hostnames, and the split is the pillar's
 * whole security model. Each is named below by its **sub-router key**, which
 * is also the prefix of the `operationId`s it projects and therefore the name
 * a generated client will call it by:
 *
 * - **`operator`** (`/operator/*`) — behind Cloudflare Access via the shell's
 *   nginx at `/bfm-api/`, gated per route on a resolved principal.
 * - **`device`** (`/devices/*`) — on bfm's own tunnel hostname with Access
 *   bypassed, and gated by nothing that resolves an identity, because this is
 *   how a caller acquires one. Just the pairing exchange today; refresh
 *   (POPS-1375) joins it. `rest-device.ts` says what stands in for a gate.
 * - **`mobile` / `mobileFinance`** (`/mobile/*`) — the same bypassed hostname,
 *   behind `requireDevice`. Everything a phone calls once it has paired.
 *
 * The two device-facing surfaces are one hostname but not one gate, and the
 * naming keeps them apart on purpose: `/devices/*` is what a caller reaches
 * *without* a device, `/mobile/*` is what it reaches *with* one.
 *
 * `/health` belongs to none of them and answers on both hostnames.
 *
 * The iOS client is generated from the projection of this file, so a field
 * renamed under `/mobile` renames it on a handset. That is the intended
 * failure mode (the app stops building), but only for changes somebody meant
 * to make.
 *
 * The mobile routes are **mobile-shaped**, not a proxy: one round trip per
 * screen, payloads holding what that screen draws and nothing else, and no
 * hint that `finance` exists as a separate service. The path segment says
 * `finance` because that is what the data is about, not where the phone should
 * look.
 */
import { initContract } from '@ts-rest/core';
import { z } from 'zod';

import { bfmDeviceContract } from './rest-device.js';
import { bfmOperatorContract } from './rest-operator.js';
import {
  HealthResponseSchema,
  MobileBootstrapResponseSchema,
  DeviceRevokedErrorSchema,
  MobileInvalidTokenErrorSchema,
  MobileRequestErrorSchema,
  MobileTransactionDetailSchema,
  MobileTransactionsPageSchema,
  MobileUpstreamErrorSchema,
  RateLimitErrorSchema,
} from './rest-schemas.js';

const c = initContract();

/**
 * The three the `/mobile` perimeter answers itself, before any handler runs —
 * the rate limiter and then `requireDevice`, both mounted on the prefix in
 * `app.ts`.
 *
 * Declared on every route anyway. The phone switches on all three and they
 * select three different recoveries — back off and retry unchanged, refresh
 * the access token, or return to pairing and wipe the keychain — so they
 * belong in the document the phone's client is generated from. A status the
 * document omits is a status that client has no case for.
 */
const MOBILE_PERIMETER_RESPONSES = {
  // A literal `code` per status rather than one two-member enum on both. The
  // code restates the status by design, so sharing a schema would have the
  // document promise a `401 device_revoked` the guard cannot produce and make
  // every generated client branch on it. `require-device.ts` pairs them at the
  // point the response is built, which is the half a schema cannot enforce.
  401: MobileInvalidTokenErrorSchema,
  403: DeviceRevokedErrorSchema,
  429: RateLimitErrorSchema,
} as const;

/**
 * The request itself was wrong. Declared on every mobile route rather than
 * only the ones with a query to get wrong: ts-rest rejects contract-level
 * validation failures before a handler runs, so any route can answer 400 the
 * moment it grows a validated input, and `app.ts` reshapes those into this
 * schema so the wire never carries a 400 the document does not describe.
 */
const MOBILE_REQUEST_RESPONSES = {
  400: MobileRequestErrorSchema,
} as const;

/**
 * A pillar behind bfm could not serve the request. Both statuses carry the
 * same shape and are told apart by it: 503 is worth retrying, 502 is not.
 */
const MOBILE_UPSTREAM_RESPONSES = {
  502: MobileUpstreamErrorSchema,
  503: MobileUpstreamErrorSchema,
} as const;

/**
 * Page size. Capped well below what a scroll would ever render at once —
 * bfm's whole premise is that the phone is on cellular, and a caller asking
 * for a thousand rows is asking for a screen it cannot draw.
 */
const MobilePageLimit = z.coerce.number().int().positive().max(100).optional();

const mobileFinanceContract = c.router({
  listTransactions: {
    method: 'GET',
    path: '/mobile/finance/transactions',
    query: z.object({
      limit: MobilePageLimit,
      /**
       * Opaque continuation token from a previous page's `nextCursor`. Its
       * contents are bfm's business and may change; the app must echo it back
       * unmodified and must never construct one.
       */
      cursor: z.string().optional(),
    }),
    responses: {
      200: MobileTransactionsPageSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'One cursor-paginated page of transaction list rows',
  },
  getTransaction: {
    method: 'GET',
    path: '/mobile/finance/transactions/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: MobileTransactionDetailSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'The fuller record behind one list row, for the detail screen',
  },
});

/**
 * The app's first authenticated call. It answers what the phone should render,
 * so it declares no upstream statuses: bootstrap probes pillars but calls
 * none, and a federation that is entirely unreachable is a `200` describing
 * that rather than an error (see `src/api/mobile/README.md`).
 */
const mobileContract = c.router({
  bootstrap: {
    method: 'GET',
    path: '/mobile/bootstrap',
    responses: {
      200: MobileBootstrapResponseSchema,
      ...MOBILE_PERIMETER_RESPONSES,
    },
    summary: 'What the app should render, and who the federation says it is talking to',
  },
});

export const bfmContract = c.router(
  {
    health: {
      method: 'GET',
      path: '/health',
      responses: { 200: HealthResponseSchema },
      summary: 'Liveness shape. Answers without a database round-trip',
    },
    device: bfmDeviceContract,
    operator: bfmOperatorContract,
    mobile: mobileContract,
    mobileFinance: mobileFinanceContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type BfmContract = typeof bfmContract;
