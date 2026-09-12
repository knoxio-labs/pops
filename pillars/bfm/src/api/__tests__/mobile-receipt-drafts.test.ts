/**
 * Separating a receipt's extraction from its persistence, and a purchase
 * typed by hand (POPS-2454) — end to end through the real app, the real
 * perimeter, the real gateway and the real wire validation, with only
 * purchases' network replaced.
 *
 * Three things are being defended here that `client.test.ts` cannot reach:
 *
 *   - **The gate.** Every route declares a capability, and a device that
 *     holds `purchases.receipts.write` but not `purchases.write` may
 *     extract and save a receipt draft and may NOT create a manual entry —
 *     the two are different authorities (ADR-048).
 *   - **The ceiling.** `extractReceipt` still refuses an oversized upload
 *     itself, exactly as the retired `uploadReceipt` did.
 *   - **Persistence never happens on extract.** `saveReceiptDraft` and
 *     `createManualPurchase` are the only two calls that reach
 *     `purchase.createManual` / `receipt.saveDraft`; extracting never does.
 */
import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_DEVICE_CAPABILITIES,
  serialiseDeviceCapabilities,
} from '../../contract/capabilities.js';
import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobilePurchasesClient } from '../purchases/client.js';
import { createTestApp, type TestApp } from './harness.js';
import {
  createPurchasesDraftFake,
  purchasesDraft,
  purchasesDraftUnreadable,
  purchasesPurchaseDetail,
} from './purchases-draft-fake.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MobileCapability } from '../../contract/capabilities.js';
import type { MobileReceiptPart } from '../../contract/rest-schemas.js';

const EXTRACT_PATH = '/mobile/purchases/receipts/extract';
const SAVE_DRAFT_PATH = '/mobile/purchases/receipts';
const MANUAL_PATH = '/mobile/purchases/manual';

const ONE_PART: readonly MobileReceiptPart[] = [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }];

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

/** An app whose purchases answers `extractResult`/`writeResult`, plus a paired device's token. */
function openWith(
  extractResult: CallResult<unknown>,
  writeResult?: CallResult<unknown>,
  capabilities: readonly MobileCapability[] = DEFAULT_DEVICE_CAPABILITIES
) {
  const fake = createPurchasesDraftFake(extractResult, writeResult);
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(fake.factory)),
  });
  apps.push(created);

  const row = deviceRow({
    capabilityMode: 'explicit',
    capabilities: serialiseDeviceCapabilities(capabilities),
  });
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token, fake, created };
}

function post(app: Express, token: string | null, path: string, body: object) {
  return requestOn(app, (r) => {
    const request = r.post(path).send(body);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}

describe('the gate', () => {
  it('refuses extractReceipt carrying no token', async () => {
    const { app } = openWith(purchasesDraft());
    const res = await post(app, null, EXTRACT_PATH, { parts: ONE_PART });
    expect(res.status).toBe(401);
  });

  it('refuses a manual entry from a device that never held purchases.write', async () => {
    const { app, token } = openWith(purchasesDraft(), purchasesPurchaseDetail(), [
      'session.read',
      'purchases.receipts.write',
    ]);

    const res = await post(app, token, MANUAL_PATH, {
      merchantName: 'Corner Store',
      orderedAt: '2026-08-01T09:00:00+10:00',
      currency: 'AUD',
      totalCents: 500,
      items: [
        { name: 'Coffee', quantity: null, unitPriceCents: 500, lineTotalCents: 500, notes: [] },
      ],
      idempotencyKey: 'manual-1',
    });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('capability_not_granted');
    expect(res.body.capability).toBe('purchases.write');
  });

  it('lets a device holding purchases.write reach manual entry', async () => {
    const { app, token, fake } = openWith(purchasesDraft(), purchasesPurchaseDetail(), [
      'session.read',
      'purchases.write',
    ]);

    const res = await post(app, token, MANUAL_PATH, {
      merchantName: 'Corner Store',
      orderedAt: '2026-08-01T09:00:00+10:00',
      currency: 'AUD',
      totalCents: 500,
      items: [
        { name: 'Coffee', quantity: null, unitPriceCents: 500, lineTotalCents: 500, notes: [] },
      ],
      idempotencyKey: 'manual-1',
    });

    expect(res.status).toBe(200);
    expect(fake.created).toHaveLength(1);
  });

  it('refuses extraction from a device holding only purchases.write', async () => {
    const { app, token } = openWith(purchasesDraft(), undefined, [
      'session.read',
      'purchases.write',
    ]);

    const res = await post(app, token, EXTRACT_PATH, { parts: ONE_PART });

    expect(res.status).toBe(403);
    expect(res.body.capability).toBe('purchases.receipts.write');
  });
});

describe('extractReceipt', () => {
  it('answers a draft, persisting nothing', async () => {
    const { app, token, fake } = openWith(purchasesDraft({ reconciled: true }));

    const res = await post(app, token, EXTRACT_PATH, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('draft');
    expect(res.body.reconciled).toBe(true);
    expect(res.body.draft.totalCents).toBe(2750);
    expect(fake.saved).toEqual([]);
    expect(fake.created).toEqual([]);
  });

  it('answers a draft with the gate’s objections when unreconciled — still editable', async () => {
    const { app, token } = openWith(
      purchasesDraft({
        reconciled: false,
        failures: [{ kind: 'sum-mismatch', detail: 'off by $2.40', deltaCents: 240 }],
      })
    );

    const res = await post(app, token, EXTRACT_PATH, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body.kind).toBe('draft');
    expect(res.body.reconciled).toBe(false);
    expect(res.body.failures).toEqual([
      { code: 'sum-mismatch', detail: 'off by $2.40', deltaCents: 240 },
    ]);
    expect(res.body.draft.items).toHaveLength(1);
  });

  it('answers unreadable when the model returns nothing usable', async () => {
    const { app, token } = openWith(purchasesDraftUnreadable('the photograph is too blurred'));

    const res = await post(app, token, EXTRACT_PATH, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'unreadable',
      receiptUris: expect.any(Array),
      reason: 'the photograph is too blurred',
    });
  });

  it('refuses an oversized upload in the shape the contract declares, before purchases sees it', async () => {
    const { app, token, fake } = openWith(purchasesDraft());

    const res = await post(app, token, EXTRACT_PATH, {
      parts: [{ mediaType: 'image/jpeg', dataBase64: 'A'.repeat(13 * 1024 * 1024) }],
    });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      code: 'payload_too_large',
      maxBytes: 12 * 1024 * 1024,
      message: expect.any(String),
    });
    expect(fake.extracted).toEqual([]);
  });

  it('reports an unreachable purchases as a retryable 503, never as a draft', async () => {
    const { app, token } = openWith({ kind: 'unavailable', pillar: 'purchases' });

    const res = await post(app, token, EXTRACT_PATH, { parts: ONE_PART });

    expect(res.status).toBe(503);
    expect(res.body.code).toBe('upstream_unavailable');
  });
});

describe('saveReceiptDraft', () => {
  const DOCUMENT_URI = 'pops://purchases/receipt/' + 'a'.repeat(64);
  const SAVE_BODY = {
    merchantName: 'Bunnings Warehouse',
    orderedAt: '2026-08-01T14:32:00+10:00',
    currency: 'AUD',
    totalCents: 1250,
    items: [
      {
        name: 'Timber Pine DAR 42x19',
        quantity: null,
        unitPriceCents: 1250,
        lineTotalCents: 1250,
        notes: [],
      },
    ],
    documents: [{ documentUri: DOCUMENT_URI, kind: 'receipt' as const }],
    idempotencyKey: 'save-1',
  };

  it('persists the reviewed draft', async () => {
    const { app, token, fake } = openWith(
      purchasesDraft(),
      purchasesPurchaseDetail({ id: 'pur-9' })
    );

    const res = await post(app, token, SAVE_DRAFT_PATH, SAVE_BODY);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe('pur-9');
    expect(fake.saved).toHaveLength(1);
  });

  it('reports a producer conflict as the code the app can switch on', async () => {
    const conflict: CallResult<unknown> = {
      kind: 'conflict',
      pillar: 'purchases',
      message: 'This receipt has already been saved as purchase pur-1',
    };
    const { app, token } = openWith(purchasesDraft(), conflict);

    const res = await post(app, token, SAVE_DRAFT_PATH, SAVE_BODY);

    expect(res.body.code).toBe('upstream_conflict');
  });

  it('rejects a save with no receipt attached, before it ever reaches purchases', async () => {
    const { app, token, fake } = openWith(purchasesDraft(), purchasesPurchaseDetail());

    const res = await post(app, token, SAVE_DRAFT_PATH, { ...SAVE_BODY, documents: [] });

    expect(res.status).toBe(400);
    expect(fake.saved).toEqual([]);
  });
});

describe('createManualPurchase', () => {
  it('persists a purchase with no receipt', async () => {
    const { app, token, fake } = openWith(
      purchasesDraft(),
      purchasesPurchaseDetail({ id: 'pur-manual-1', source: 'manual' }),
      ['session.read', 'purchases.write']
    );

    const res = await post(app, token, MANUAL_PATH, {
      merchantName: 'Corner Store',
      orderedAt: '2026-08-01T09:00:00+10:00',
      currency: 'AUD',
      totalCents: 500,
      items: [
        { name: 'Coffee', quantity: null, unitPriceCents: 500, lineTotalCents: 500, notes: [] },
      ],
      idempotencyKey: 'manual-1',
    });

    expect(res.status).toBe(200);
    expect(res.body.source).toBe('manual');
    expect(fake.created).toHaveLength(1);
    expect((fake.created[0] as { documents?: unknown }).documents).toBeUndefined();
  });
});
