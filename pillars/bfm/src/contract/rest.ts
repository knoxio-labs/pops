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
import { mobileFinanceContract } from './rest-mobile-finance.js';
import {
  MOBILE_PERIMETER_RESPONSES,
  MOBILE_REQUEST_RESPONSES,
  MOBILE_UPSTREAM_RESPONSES,
  MobilePageLimit,
} from './rest-mobile-responses.js';
import { bfmOperatorContract } from './rest-operator.js';
import {
  HealthResponseSchema,
  MobileBootstrapResponseSchema,
  MobilePayloadTooLargeErrorSchema,
  MobilePurchaseDetailSchema,
  MobilePurchasesPageSchema,
  MobileReceiptBytesSchema,
  MobileReceiptOutcomeSchema,
  MobileReceiptUploadBodySchema,
  MobileUpstreamErrorSchema,
} from './rest-schemas.js';

const c = initContract();

/**
 * The phone's view of `purchases`: the orders it can read, and the receipt it
 * can hand over.
 *
 * Three routes and two capabilities, which is the whole point of ADR-048 in
 * one sub-router. `purchases.receipts.write` buys the upload and nothing else;
 * `purchases.read` buys the list and the detail and nothing else. A device may
 * hold either without the other — photographing a till slip and scrolling a
 * history of everything the household has bought are different authorities —
 * and destroying an order is on neither, because it is not on this surface at
 * all. `__tests__/mobile-capabilities.test.ts` walks this contract and fails on
 * a mobile route that declares nothing.
 */
const mobilePurchasesContract = c.router({
  listPurchases: {
    method: 'GET',
    path: '/mobile/purchases',
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
      200: MobilePurchasesPageSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'One cursor-paginated page of purchase list rows',
    metadata: requires('purchases.read'),
  },
  getPurchase: {
    method: 'GET',
    path: '/mobile/purchases/:id',
    pathParams: z.object({ id: z.string() }),
    responses: {
      200: MobilePurchaseDetailSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'The fuller record behind one list row, with its lines',
    metadata: requires('purchases.read'),
  },
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
  getReceiptThumbnail: {
    method: 'GET',
    path: '/mobile/purchases/receipts/:sha256/thumbnail',
    pathParams: z.object({ sha256: z.string() }),
    responses: {
      200: MobileReceiptBytesSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      // The receipt is a PDF or a pasted body, or its bytes will not decode.
      // Settled rather than transient — see `MobileUpstreamErrorSchema`'s
      // `upstream_unsupported_media`.
      415: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'The list-sized image behind a row’s receiptUri',
    metadata: requires('purchases.receipts.read'),
  },
  getReceipt: {
    method: 'GET',
    path: '/mobile/purchases/receipts/:sha256',
    pathParams: z.object({ sha256: z.string() }),
    responses: {
      200: MobileReceiptBytesSchema,
      ...MOBILE_REQUEST_RESPONSES,
      ...MOBILE_PERIMETER_RESPONSES,
      404: MobileUpstreamErrorSchema,
      ...MOBILE_UPSTREAM_RESPONSES,
    },
    summary: 'The receipt itself, full size, for a detail screen',
    metadata: requires('purchases.receipts.read'),
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
