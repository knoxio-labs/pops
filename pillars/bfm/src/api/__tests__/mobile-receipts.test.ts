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
import type { ReceiptRateLimitOptions } from '../auth/receipt-rate-limit.js';
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
function openWith(
  result: CallResult<unknown>,
  receiptRateLimit?: ReceiptRateLimitOptions
): {
  app: Express;
  token: string;
  fake: PurchasesFake;
  created: TestApp;
} {
  const fake = createPurchasesFake(result);
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(fake.factory)),
    ...(receiptRateLimit === undefined ? {} : { receiptRateLimit }),
  });
  apps.push(created);

  const row = deviceRow();
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token: token, fake, created };
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
      purchasesNeedsReview([{ kind: 'sum-mismatch', detail: 'off by 240c', deltaCents: -240 }])
    );

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'needs-review',
      receiptCount: 1,
      problems: [{ code: 'sum-mismatch', detail: 'off by 240c', deltaCents: -240 }],
      extracted: {
        merchantName: 'Woolworths',
        address: '12 Example St',
        purchasedOn: '2026-08-13',
        purchasedAt: '14:05',
        currency: 'AUD',
        total: '$84.20',
        tax: '$7.65',
        discounts: ['$2.00'],
        surcharges: ['$0.50'],
        shipping: null,
        lines: [{ description: 'MILK 2L', amount: '$3.10', quantity: 2, unitNote: '2 @ $1.55' }],
        unreadableNotes: ['line 7 is smudged'],
      },
    });
  });

  it('serves the reading through the real perimeter, not only through the mapper', async () => {
    // The route declares the outcome schema, so ts-rest would strip a field the
    // contract does not know about. This is the assertion that fails if the
    // reading is added to the mapper and forgotten in the contract — the exact
    // shape of the defect this arm had.
    const { app, token } = openWith(
      purchasesNeedsReview([{ kind: 'sum-mismatch', detail: 'off by 240c', deltaCents: -240 }])
    );

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.body.extracted?.merchantName).toBe('Woolworths');
    expect(res.body.extracted?.lines).toHaveLength(1);
    expect(res.body.problems?.[0]?.deltaCents).toBe(-240);
  });

  it('answers 200 for unreadable, with the reason the model gave', async () => {
    const { app, token } = openWith(purchasesUnreadable('the photograph is too blurred'));

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      kind: 'unreadable',
      receiptCount: 1,
      reason: 'the photograph is too blurred',
    });
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

describe('what the handset knew that the paper cannot state', () => {
  const CAPTURE = {
    capturedAt: '2026-08-13T14:05:00+10:00',
    timeZone: 'Australia/Sydney',
    location: { latitude: -33.87, longitude: 151.21 },
  };

  it('carries the capture block through the perimeter unchanged', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, { parts: ONE_PART, capture: CAPTURE });

    expect(res.status).toBe(200);
    expect(fake.uploads).toEqual([{ parts: ONE_PART, capture: CAPTURE }]);
  });

  it('accepts an upload that states none, exactly as before', async () => {
    // The compatibility guarantee that matters most here: the app is
    // distributed rather than deployed, so a build predating this field keeps
    // calling the route from hardware nobody can roll forward (ADR-043).
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(fake.uploads).toEqual([{ parts: ONE_PART }]);
  });

  it('accepts a capture block stating only some of what it could', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, { parts: ONE_PART, capture: { timeZone: 'Europe/Paris' } });

    expect(res.status).toBe(200);
    expect(fake.uploads).toEqual([{ parts: ONE_PART, capture: { timeZone: 'Europe/Paris' } }]);
  });

  it('refuses a capture time with no offset here rather than upstream', async () => {
    // The producer requires the offset, so a naive local timestamp is a 400
    // either way. Answering it at the perimeter makes it a fixable client
    // mistake instead of an upstream error the phone cannot act on.
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, {
      parts: ONE_PART,
      capture: { capturedAt: '2026-08-13T14:05:00' },
    });

    expect(res.status).toBe(400);
    expect(fake.uploads).toEqual([]);
  });

  it('refuses a coordinate that is not a point on the globe', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, {
      parts: ONE_PART,
      capture: { location: { latitude: 200, longitude: 10 } },
    });

    expect(res.status).toBe(400);
    expect(fake.uploads).toEqual([]);
  });

  it('refuses half a coordinate, which is not a place', async () => {
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, {
      parts: ONE_PART,
      capture: { location: { latitude: -33.87 } },
    });

    expect(res.status).toBe(400);
    expect(fake.uploads).toEqual([]);
  });

  it('never echoes a coordinate back in the refusal', async () => {
    // A location is the most sensitive thing this route carries, and a
    // validation error that quotes the offending value is the ordinary way
    // one ends up in a log or on a screen it was never meant to reach.
    const { app, token } = openWith(purchasesCreated());

    const res = await post(app, token, {
      parts: ONE_PART,
      capture: { location: { latitude: 123.456, longitude: 151.21 } },
    });

    expect(res.status).toBe(400);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('151.21');
    expect(body).not.toContain('123.456');
    expect(body).not.toContain('latitude');
    expect(body).not.toContain('longitude');
  });

  it('forwards a capture time bfm would have no way to check', async () => {
    // 2041 is the producer's to discard: it owns the upload instant this has
    // to be compared against. A second opinion here is a second rule.
    const { app, token, fake } = openWith(purchasesCreated());

    const res = await post(app, token, {
      parts: ONE_PART,
      capture: { capturedAt: '2041-03-02T09:00:00Z' },
    });

    expect(res.status).toBe(200);
    expect(fake.uploads).toEqual([
      { parts: ONE_PART, capture: { capturedAt: '2041-03-02T09:00:00Z' } },
    ]);
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

describe('the receipt budget', () => {
  function overBudget(perClientLimit: number): ReceiptRateLimitOptions {
    return { perClientLimit, globalLimit: 1_000 };
  }

  it('allows exactly the configured budget, then answers 429 with Retry-After', async () => {
    const { app, token, fake } = openWith(purchasesCreated(), overBudget(2));

    const first = await post(app, token, { parts: ONE_PART });
    const second = await post(app, token, { parts: ONE_PART });
    const third = await post(app, token, { parts: ONE_PART });

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);
    expect(third.body.code).toBe('rate_limited');
    expect(Number(third.headers['retry-after'])).toBeGreaterThan(0);
    // The two admitted requests, and no more — the budget actually spent
    // purchases' quota rather than merely reporting one.
    expect(fake.uploads).toHaveLength(2);
  });

  it('refuses before calling purchases, so a flood cannot burn a vision call', async () => {
    // If the limiter ran after the handler, an over-budget request would
    // still have paid for the exact thing the budget exists to bound.
    const { app, token, fake } = openWith(purchasesCreated(), overBudget(1));

    await post(app, token, { parts: ONE_PART });
    const refused = await post(app, token, { parts: ONE_PART });

    expect(refused.status).toBe(429);
    expect(fake.uploads).toHaveLength(1);
  });

  it('caps the whole route regardless of the address a caller claims', async () => {
    const { app, token } = openWith(purchasesCreated(), { perClientLimit: 100, globalLimit: 2 });

    const statuses: number[] = [];
    for (const ip of ['203.0.113.1', '203.0.113.2', '203.0.113.3']) {
      const res = await requestOn(app, (r) =>
        r
          .post(UPLOAD_PATH)
          .set('Authorization', `Bearer ${token}`)
          .set('CF-Connecting-IP', ip)
          .send({ parts: ONE_PART })
      );
      statuses.push(res.status);
    }

    expect(statuses[2]).toBe(429);
  });

  it('charges a budget separate from the /mobile perimeter', async () => {
    // One counter for both would let a burst of list-page reads spend the
    // receipt budget, or a run of receipts lock a handset out of its own
    // transaction list.
    const { app, token } = openWith(purchasesCreated(), overBudget(1));

    await post(app, token, { parts: ONE_PART });
    expect((await post(app, token, { parts: ONE_PART })).status).toBe(429);

    const mobile = await requestOn(app, (r) =>
      r.get('/mobile/anything').set('Authorization', `Bearer ${token}`)
    );
    expect(mobile.status).not.toBe(429);
  });

  it('is unaffected by traffic against the general /mobile perimeter', async () => {
    // The other direction of the previous case: spending the wide, cheap
    // budget on reads must not eat into the narrow, expensive one.
    const { app, token, fake } = openWith(purchasesCreated(), {
      perClientLimit: 5,
      globalLimit: 5,
    });

    for (let i = 0; i < 30; i += 1) {
      await requestOn(app, (r) =>
        r.get('/mobile/anything').set('Authorization', `Bearer ${token}`)
      );
    }

    const res = await post(app, token, { parts: ONE_PART });

    expect(res.status).toBe(200);
    expect(fake.uploads).toHaveLength(1);
  });

  it('spends the budget the same whether the upload carries one part or the max', async () => {
    // The module deliberately charges a flat cost per request rather than one
    // weighted by part count — purchases reads a whole receipt in one vision
    // call regardless of how many images it was sent as, so a per-part weight
    // would track a number that does not track the actual cost. This pins
    // that a maximal upload spends exactly as much budget as a minimal one,
    // not more.
    const eightParts = Array.from({ length: 8 }, () => ONE_PART[0]);
    const { app, token, fake } = openWith(purchasesCreated(), overBudget(1));

    const heavy = await post(app, token, { parts: eightParts });
    expect(heavy.status).toBe(200);

    const light = await post(app, token, { parts: ONE_PART });
    expect(light.status).toBe(429);

    expect(fake.uploads).toHaveLength(1);
  });
});
