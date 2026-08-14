/**
 * The mobile receipt upload, end to end through the real app, the real
 * perimeter, the real gateway and the real wire validation — with only
 * purchases' network replaced.
 *
 * This is bfm's first write on the phone's behalf (ADR-046), and three things
 * are being defended:
 *
 *   - **The gate.** A write reachable without a device would be a stranger on
 *     an Access-bypassed hostname spending a vision-model call per request.
 *   - **The three outcomes.** `created`, `needs-review` and `unreadable` are
 *     all a `200`, told apart by `kind`. Collapsing any two — or answering one
 *     of them with an error status — loses the distinction the feature exists
 *     for.
 *   - **The ceiling.** bfm refuses an oversized upload itself, in the shape the
 *     contract declares, rather than forwarding it or answering Express's HTML
 *     error page.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { deviceRow } from '../../db/__tests__/helpers.js';
import { devices } from '../../db/index.js';
import { mintAccessToken } from '../auth/access-token.js';
import { createPillarGateway } from '../pillars/gateway.js';
import { createMobilePurchasesClient } from '../purchases/client.js';
import { createTestApp, type TestApp } from './harness.js';
import {
  createPurchasesFake,
  purchasesCreated,
  purchasesNeedsReview,
  purchasesUnreadable,
} from './purchases-fake.js';
import { requestOn } from './test-http.js';

import type { Express } from 'express';

import type { CallResult } from '@pops/pillar-sdk/server';

import type { MobileReceiptPart } from '../../contract/rest-schemas.js';
import type { PurchasesFake } from './purchases-fake.js';

const UPLOAD_PATH = '/mobile/purchases/receipts';

const ONE_PART: readonly MobileReceiptPart[] = [{ mediaType: 'image/jpeg', dataBase64: 'AAAA' }];

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

/** An app whose purchases answers `result`, plus a token for a paired device. */
function openWith(result: CallResult<unknown>): {
  app: Express;
  token: string;
  fake: PurchasesFake;
} {
  const fake = createPurchasesFake(result);
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(fake.factory)),
  });
  apps.push(created);

  const row = deviceRow();
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token: token, fake };
}

function post(app: Express, token: string | null, body: object) {
  return requestOn(app, (r) => {
    const request = r.post(UPLOAD_PATH).send(body);
    return token === null ? request : request.set('Authorization', `Bearer ${token}`);
  });
}

describe('the gate', () => {
  it('refuses an upload carrying no token', async () => {
    const { app, fake } = openWith(purchasesCreated());

    const res = await post(app, null, { parts: ONE_PART });

    expect(res.status).toBe(401);
    expect(res.body).toEqual({ code: 'invalid_token', message: expect.any(String) });
    // The point of the guard sitting ahead of the body parser: a stranger's
    // upload never reaches purchases, and never even gets parsed.
    expect(fake.uploads).toEqual([]);
  });

  it('refuses a revoked device without calling purchases', async () => {
    const fake = createPurchasesFake(purchasesCreated());
    const created = createTestApp({
      purchases: createMobilePurchasesClient(createPillarGateway(fake.factory)),
    });
    apps.push(created);

    const row = deviceRow({ revokedAt: new Date().toISOString() });
    created.db.insert(devices).values(row).run();
    const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

    const res = await post(created.app, token, { parts: ONE_PART });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('device_revoked');
    expect(fake.uploads).toEqual([]);
  });
});

describe('the three outcomes', () => {
  it('answers 200 with the created purchase', async () => {
    const { app, token } = openWith(
      purchasesCreated({
        id: 'pur-42',
        merchantEntityName: 'Woolworths',
        totalCents: 8420,
        orderedAt: '2026-08-13T02:15:00.000Z',
        itemCount: 12,
      })
    );

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'created',
      alreadyStored: false,
      purchase: {
        id: 'pur-42',
        merchantName: 'Woolworths',
        totalCents: 8420,
        currency: 'AUD',
        orderedAt: '2026-08-13T02:15:00.000Z',
        itemCount: 12,
      },
    });
  });

  it('answers 200 for needs-review — a real purchase awaiting a human, not a failure', async () => {
    const { app, token } = openWith(
      purchasesNeedsReview([{ kind: 'sum-mismatch', detail: 'off by 240c' }])
    );

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'needs-review',
      problems: [{ code: 'sum-mismatch', detail: 'off by 240c' }],
    });
  });

  it('answers 200 for unreadable, with the reason the model gave', async () => {
    const { app, token } = openWith(purchasesUnreadable('the photograph is too blurred'));

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ kind: 'unreadable', reason: 'the photograph is too blurred' });
  });

  it('sends the parts on unchanged', async () => {
    const parts: MobileReceiptPart[] = [
      { mediaType: 'image/jpeg', dataBase64: 'AAAA' },
      { mediaType: 'application/pdf', dataBase64: 'BBBB' },
    ];
    const { app, token, fake } = openWith(purchasesCreated());

    await post(app, token, { parts });

    expect(fake.uploads).toEqual([{ parts }]);
  });
});

describe('the request the app can get wrong', () => {
  it('refuses an empty parts list as a 400 the client has a case for', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, { parts: [] });

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ code: 'invalid_request', message: expect.any(String) });
    expect(fake.uploads).toEqual([]);
  });

  it('refuses a ninth part rather than letting purchases refuse it', async () => {
    const parts = Array.from({ length: 9 }, () => ONE_PART[0]);
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, { parts });

    expect(res.status).toBe(400);
    expect(fake.uploads).toEqual([]);
  });

  it('refuses a media type the producer does not accept', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, {
      parts: [{ mediaType: 'image/heic', dataBase64: 'AAAA' }],
    });

    expect(res.status).toBe(400);
    expect(fake.uploads).toEqual([]);
  });

  it('never leaks the schema’s field names in the refusal', async () => {
    const { app, token } = openWith(purchasesCreated());

    const res = await post(app, token, { parts: [{ mediaType: 'image/jpeg' }] });

    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain('dataBase64');
  });
});

describe('the size ceiling', () => {
  it('refuses an oversized upload in the shape the contract declares', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    // Past the 12mb mount. Built as one long base64 string rather than many
    // parts, so it is the BODY limit under test and not the part cap.
    const res = await post(app, token, {
      parts: [{ mediaType: 'image/jpeg', dataBase64: 'A'.repeat(13 * 1024 * 1024) }],
    });

    expect(res.status).toBe(413);
    expect(res.body).toEqual({
      code: 'payload_too_large',
      maxBytes: 12 * 1024 * 1024,
      message: expect.any(String),
    });
    // The whole point of capping here: purchases never sees it.
    expect(fake.uploads).toEqual([]);
  });

  it('accepts an upload that is merely large', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, {
      parts: [{ mediaType: 'image/jpeg', dataBase64: 'A'.repeat(2 * 1024 * 1024) }],
    });

    expect(res.status).toBe(200);
    expect(fake.uploads).toHaveLength(1);
  });
});

describe('when purchases cannot answer', () => {
  it('reports an unreachable pillar as a retryable 503, never as an outcome', async () => {
    const { app, token } = openWith({ kind: 'unavailable', pillar: 'purchases' });

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      code: 'upstream_unavailable',
      pillar: 'purchases',
      retryable: true,
      message: expect.any(String),
    });
  });

  it('reports a shape it cannot read as a non-retryable 502', async () => {
    const { app, token } = openWith({ kind: 'ok', value: { kind: 'created' } });

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
    expect(res.body.retryable).toBe(false);
  });

  it('reports a rejected credential as a 502 about this pillar, not a 401 at the phone', async () => {
    const { app, token } = openWith({
      kind: 'unauthorized',
      pillar: 'purchases',
      message: 'missing scope purchases.receipt',
    });

    const res = await post(app, token, { parts: ONE_PART });

    // A 401 here would send the app into a token-refresh loop against a fault
    // only an operator can fix — the missing registry grant.
    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_misconfigured');
  });

  it('never answers a 404, which this route does not declare', async () => {
    const { app, token } = openWith({ kind: 'not-found', pillar: 'purchases' });

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(502);
    expect(res.body.code).toBe('upstream_contract_mismatch');
  });
});
