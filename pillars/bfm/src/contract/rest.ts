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
 *   bypassed, and gated by nothing that resolves an identity: these are how a
 *   caller acquires a token and how it replaces one that has lapsed, so
 *   neither can require presenting one. `rest-device.ts` says what stands in
 *   for a gate, per route.
 * - **`mobile` / `mobileFinance` / `mobilePurchases`** (`/mobile/*`) — the same
 *   bypassed hostname, behind `requireDevice` and then `requireCapability`.
 *   Everything a phone calls once it has paired. Every route here declares the
 *   capability it requires in its `metadata`, and that declaration — not the
 *   HTTP verb — is what decides whether a given handset may reach it
 *   (ADR-048). `capabilities.ts` holds the vocabulary and says what a new one
 *   costs.
 *
 * The two device-facing surfaces are one hostname but not one gate, and the
 * naming keeps them apart on purpose: `/devices/*` is what a caller reaches
 * *without* a usable token, `/mobile/*` is what it reaches *with* one.
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

import { requires } from './capabilities.js';
import { bfmDeviceContract } from './rest-device.js';
import { bfmOperatorContract } from './rest-operator.js';
import {
  HealthResponseSchema,
  MobileBootstrapResponseSchema,
  MobileForbiddenErrorSchema,
  MobileInvalidTokenErrorSchema,
  MobilePayloadTooLargeErrorSchema,
  MobileReceiptOutcomeSchema,
  MobileReceiptUploadBodySchema,
  MobileRequestErrorSchema,
  MobileTransactionDetailSchema,
  MobileTransactionsPageSchema,
  MobileUpstreamErrorSchema,
  RateLimitErrorSchema,
} from './rest-schemas.js';

const c = initContract();

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
const MOBILE_PERIMETER_RESPONSES = {
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
    metadata: requires('finance.transactions.read'),
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
    metadata: requires('finance.transactions.read'),
  },
});

/**
 * The mobile write surface: content the handset captured, handed to the pillar
 * that owns it.
 *
 * One route today, and the reason it is only one is the capability it declares
 * rather than the verb it uses. `purchases.receipts.write` buys a receipt
 * upload and nothing else in that pillar — reading an order is a separate
 * capability, and destroying one is not on this surface at all (ADR-048).
 * `__tests__/mobile-capabilities.test.ts` walks this contract and fails on a
 * mobile route that declares nothing.
 */
const mobilePurchasesContract = c.router({
  uploadReceipt: {
    method: 'POST',
    path: '/mobile/purchases/receipts',
    body: MobileReceiptUploadBodySchema,
    responses: {
      // One status for all three outcomes. Each is a receipt bfm successfully
      // handed over and got an answer about, so none of them is an HTTP
      // failure — the distinction lives in the body's `kind`, which the app
      // switches on, rather than in a status code that would also have to mean
      // "the upload itself went wrong".
      200: MobileReceiptOutcomeSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      413: MobilePayloadTooLargeErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'Hand a photographed, scanned or pasted receipt to the purchases pillar',
    metadata: requires('purchases.receipts.write'),
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
    metadata: requires('session.read'),
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
    mobilePurchases: mobilePurchasesContract,
  },
  {
    pathPrefix: '',
    strictStatusCodes: false,
  }
);

export type BfmContract = typeof bfmContract;
