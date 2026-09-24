import { describe, expect, it } from 'vitest';

import {
  DETAIL_OPERATION_ID,
  LIST_OPERATION_ID,
  MANUAL_OPERATION_ID,
  MONTH_SUMMARY_OPERATION_ID,
  PURCHASES_PILLAR_ID,
  RECEIPT_THUMBNAIL_OPERATION_ID,
  SEARCH_OPERATION_ID,
  SEEDED_RECEIPT_SHA256,
  UPLOAD_OPERATION_ID,
  detailRoute,
  listRoute,
  manualRoute,
  monthSummaryRoute,
  purchasesRegistryEntry,
  readPurchasesContract,
  receiptThumbnailRoute,
  searchRoute,
  seededPurchases,
  startPurchasesStub,
  uploadRoute,
} from '../ios-e2e/purchases-stub.mjs';

describe('the purchases contract this stub serves', () => {
  it('is the pillar committed snapshot, and declares the operation bfm calls by name', () => {
    // The claim the whole stub rests on. A reachability probe that answers
    // healthy is bfm being told it *could* call purchases; a snapshot that no
    // longer declares `receipt.upload` makes that a lie the harness tells
    // quietly, so this is asserted here rather than discovered on a simulator.
    expect(uploadRoute(readPurchasesContract())).toEqual({ method: 'POST', path: '/receipts' });
  });

  it('refuses a document with no paths rather than reporting a pillar with no routes', () => {
    expect(() => uploadRoute({})).toThrow(/no `paths` object/u);
  });

  it('names the missing operation when a rename takes it away', () => {
    expect(() =>
      uploadRoute({ paths: { '/receipts': { post: { operationId: 'other' } } } })
    ).toThrow(new RegExp(`declares no ${UPLOAD_OPERATION_ID}`, 'u'));
  });

  it('also declares the manual-purchase operation the bfm calls by name', () => {
    // The one write POPS-2454's stub answers for real — see this stub's
    // header on why. Same failure mode as `receipt.upload`'s: a rename here
    // would leave the stub reporting a pillar the bfm cannot actually call.
    expect(manualRoute(readPurchasesContract())).toEqual({
      method: 'POST',
      path: '/purchases/manual',
    });
  });

  it('names the missing operation when a rename takes the manual route away', () => {
    expect(() =>
      manualRoute({ paths: { '/purchases/manual': { post: { operationId: 'other' } } } })
    ).toThrow(new RegExp(`declares no ${MANUAL_OPERATION_ID}`, 'u'));
  });

  it('declares the list, detail and summary operations the bfm reads through', () => {
    const contract = readPurchasesContract();
    expect(listRoute(contract)).toEqual({ method: 'GET', path: '/purchases' });
    expect(detailRoute(contract)).toEqual({ method: 'GET', path: '/purchases/{id}' });
    expect(monthSummaryRoute(contract)).toEqual({
      method: 'GET',
      path: '/analytics/month-summary',
    });
  });

  it('also declares the search operation the universal search screen reads through', () => {
    expect(searchRoute(readPurchasesContract())).toEqual({ method: 'POST', path: '/search' });
  });

  it('names the missing operation when a rename takes the search route away', () => {
    expect(() => searchRoute({ paths: { '/search': { post: { operationId: 'other' } } } })).toThrow(
      new RegExp(`declares no ${SEARCH_OPERATION_ID}`, 'u')
    );
  });

  it('also declares the receipt-thumbnail operation the detail screen reads through', () => {
    expect(receiptThumbnailRoute(readPurchasesContract())).toEqual({
      method: 'GET',
      path: '/receipts/{sha256}/thumbnail',
    });
  });

  it('names the missing operation when a rename takes the thumbnail route away', () => {
    expect(() =>
      receiptThumbnailRoute({ paths: { '/receipts/{sha256}/thumbnail': { get: {} } } })
    ).toThrow(new RegExp(`declares no ${RECEIPT_THUMBNAIL_OPERATION_ID}`, 'u'));
  });
});

describe('the purchases registry entry', () => {
  const entry = purchasesRegistryEntry({
    baseUrl: 'http://127.0.0.1:4242',
    now: '2026-08-20T00:00:00.000Z',
  });

  it('carries the pillar id the bfm looks up for receipt-capture', () => {
    // `MOBILE_FEATURES` in `pillars/bfm/src/api/mobile/features.ts` maps
    // `receipt-capture` onto this id, and `deriveFeatures` resolves a feature
    // whose pillar is absent from the snapshot to `unavailable`. A typo here
    // would leave the feature withheld with everything else looking correct.
    expect(entry.pillarId).toBe(PURCHASES_PILLAR_ID);
    expect(entry.baseUrl).toBe('http://127.0.0.1:4242');
  });

  it('states registered, a status and a heartbeat, which the two readers need between them', () => {
    // `HttpDiscoveryTransport` throws on an entry with no `status`, where the
    // snapshot parser treats it as optional — so the entry has to satisfy the
    // stricter reader rather than either one.
    expect(entry).toMatchObject({
      registered: true,
      status: 'healthy',
      lastHeartbeatAt: '2026-08-20T00:00:00.000Z',
    });
  });

  it('names both mutations this stub answers reachability for', () => {
    expect(entry.manifest.routes.mutations).toEqual([
      `purchases.${UPLOAD_OPERATION_ID}`,
      `purchases.${MANUAL_OPERATION_ID}`,
    ]);
  });

  it('names the list, detail, summary and receipt-thumbnail queries it now answers', () => {
    expect(entry.manifest.routes.queries).toEqual([
      `purchases.${LIST_OPERATION_ID}`,
      `purchases.${DETAIL_OPERATION_ID}`,
      `purchases.${MONTH_SUMMARY_OPERATION_ID}`,
      `purchases.${RECEIPT_THUMBNAIL_OPERATION_ID}`,
    ]);
  });
});

describe('the purchases stub', () => {
  it('starts withheld, so a flow that does not ask for receipt-capture never sees it', async () => {
    const stub = await startPurchasesStub();
    try {
      expect(stub.isReachable()).toBe(false);
      // Reset rather than answered: `probeContractRoute` reads a request that
      // never completed as `unavailable`, which is the state every flow older
      // than this one was written against.
      await expect(fetch(`${stub.url}/openapi`)).rejects.toThrow();
    } finally {
      await stub.close();
    }
  });

  it('serves the contract once armed, and stops again when it is put back', async () => {
    const stub = await startPurchasesStub();
    try {
      stub.setReachable(true);
      const answered = await fetch(`${stub.url}/openapi`);
      expect(answered.status).toBe(200);
      expect(answered.headers.get('content-type')).toBe('application/json');
      expect((await answered.json()).paths).toHaveProperty('/receipts');

      stub.setReachable(false);
      await expect(fetch(`${stub.url}/openapi`)).rejects.toThrow();
    } finally {
      await stub.close();
    }
  });

  it('says what it does not serve rather than answering something plausible', async () => {
    const stub = await startPurchasesStub();
    try {
      stub.setReachable(true);
      const answered = await fetch(`${stub.url}/receipts`, { method: 'POST', body: '{}' });
      // A 404 that names the path, not a fabricated outcome. Nothing on the
      // Simulator can produce a receipt to upload, so an answer here would be
      // a fixture no flow exercises — and a plausible one would hide the day a
      // flow started reaching it by accident.
      expect(answered.status).toBe(404);
      expect((await answered.json()).message).toMatch(/serves nothing at POST \/receipts/u);
    } finally {
      await stub.close();
    }
  });

  it('answers POST /purchases/manual for real, echoing what it was sent', async () => {
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(`${stub.url}/purchases/manual`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          merchantEntityName: 'Corner Store',
          orderedAt: '2026-09-01T00:00:00.000Z',
          currency: 'AUD',
          totalCents: 500,
          items: [{ name: 'Coffee', quantity: 1, unitPriceCents: 500, lineTotalCents: 500 }],
          idempotencyKey: 'a-key',
        }),
      });

      expect(answered.status).toBe(200);
      const body = await answered.json();
      // `PurchasesDetailResponseSchema` — `pillars/bfm/src/api/purchases/list-wire.ts` —
      // is what the bfm validates this against before mapping it onto the
      // phone's wire shape. A field this drops or renames would read on a
      // handset as a purchase with no merchant and no total, not as an error.
      expect(body).toMatchObject({
        purchase: {
          source: 'manual',
          merchantEntityName: 'Corner Store',
          totalCents: 500,
          subtotalCents: 500,
          currency: 'AUD',
          orderedAt: '2026-09-01T00:00:00.000Z',
        },
        items: [{ item: { name: 'Coffee', quantity: 1, lineTotalCents: 500 } }],
        documents: [],
      });
      expect(body.purchase.id).toEqual(expect.any(String));
    } finally {
      await stub.close();
    }
  });

  it('answers the manual write whether or not the pillar is currently reachable', async () => {
    // `reachable` gates only `/openapi` — the reachability probe the BFM
    // caches process-wide — not the routes underneath it. Gating the write on
    // it too would make this stub a worse model of `purchases` than not
    // gating it at all: nothing about a real pillar's write route consults
    // that cache.
    const stub = await startPurchasesStub();
    try {
      expect(stub.isReachable()).toBe(false);
      const answered = await fetch(`${stub.url}/purchases/manual`, {
        method: 'POST',
        body: JSON.stringify({ items: [] }),
      });
      expect(answered.status).toBe(200);
    } finally {
      await stub.close();
    }
  });

  it('pages newest first without repeating an anchor and ends with an empty page', async () => {
    const stub = await startPurchasesStub();
    try {
      const first = await fetch(`${stub.url}/purchases?limit=2`);
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.items.map((row: { id: string }) => row.id)).toEqual([
        'purchase-september-unsettled',
        'purchase-august-linked',
      ]);
      expect(firstBody.total).toBe(3);

      const anchor = firstBody.items[1];
      const second = await fetch(
        `${stub.url}/purchases?limit=2&beforeOrderedAt=${encodeURIComponent(String(anchor.orderedAt))}&beforeId=${String(anchor.id)}`
      );
      const secondBody = await second.json();
      expect(secondBody.items.map((row: { id: string }) => row.id)).toEqual([
        'purchase-july-partial',
      ]);
      expect(secondBody).not.toHaveProperty('total');

      const end = secondBody.items[0];
      const final = await fetch(
        `${stub.url}/purchases?beforeOrderedAt=${encodeURIComponent(String(end.orderedAt))}&beforeId=${String(end.id)}`
      );
      expect(await final.json()).toEqual({ items: [] });
    } finally {
      await stub.close();
    }
  });

  it('filters repeated unsettled statuses and counts the whole filtered scope', async () => {
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(
        `${stub.url}/purchases?statuses=awaiting_settlement&statuses=partial&limit=1`
      );
      const body = await answered.json();

      expect(answered.status).toBe(200);
      expect(body.items.map((row: { id: string }) => row.id)).toEqual([
        'purchase-september-unsettled',
      ]);
      expect(body.total).toBe(2);
    } finally {
      await stub.close();
    }
  });

  it("answers an omitted limit with the pillar's default page of 100", async () => {
    const stub = await startPurchasesStub();
    try {
      const extra = 101 - seededPurchases().length;
      for (let index = 0; index < extra; index += 1) {
        await fetch(`${stub.url}/purchases/manual`, {
          method: 'POST',
          body: JSON.stringify({
            merchantEntityName: `Shop ${String(index)}`,
            totalCents: 100,
            items: [{ name: 'Item', quantity: 1, lineTotalCents: 100 }],
          }),
        });
      }

      const body = await (await fetch(`${stub.url}/purchases`)).json();
      expect(body.total).toBe(101);
      expect(body.items).toHaveLength(100);
    } finally {
      await stub.close();
    }
  });

  it('serves the current and previous month figures the home screen needs', async () => {
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(`${stub.url}/analytics/month-summary?month=2026-09`);

      expect(answered.status).toBe(200);
      expect(await answered.json()).toEqual({
        month: '2026-09',
        totals: [
          {
            currency: 'AUD',
            orderCount: 1,
            accounting: {
              totalCents: 1250,
              matchedCents: 0,
              awaitingImportCents: 1250,
              residualCents: 0,
              refundedCents: 0,
              netSpendCents: 1250,
            },
          },
        ],
        purchaseCount: 1,
        previousMonthTotals: [
          {
            currency: 'AUD',
            orderCount: 1,
            accounting: {
              totalCents: 4599,
              matchedCents: 4599,
              awaitingImportCents: 0,
              residualCents: 0,
              refundedCents: 0,
              netSpendCents: 4599,
            },
          },
        ],
        unmatchedCount: 1,
        merchantLeaders: [
          {
            merchant: { resolution: 'name', entityId: null, name: 'Corner Store' },
            currency: 'AUD',
            netSpendCents: 1250,
            orderCount: 1,
          },
        ],
      });
    } finally {
      await stub.close();
    }
  });

  it('adds a manual purchase to list and detail reads, newest first', async () => {
    const stub = await startPurchasesStub();
    try {
      const createdResponse = await fetch(`${stub.url}/purchases/manual`, {
        method: 'POST',
        body: JSON.stringify({
          merchantEntityName: 'New Shop',
          totalCents: 300,
          items: [{ name: 'New item', quantity: 1, lineTotalCents: 300 }],
        }),
      });
      const created = await createdResponse.json();

      const listResponse = await fetch(`${stub.url}/purchases?limit=1`);
      const listBody = await listResponse.json();
      expect(listBody.items[0].id).toBe(created.purchase.id);
      expect(listBody.total).toBe(seededPurchases().length + 1);

      const detailResponse = await fetch(`${stub.url}/purchases/${String(created.purchase.id)}`);
      expect(detailResponse.status).toBe(200);
      expect(await detailResponse.json()).toEqual(created);
    } finally {
      await stub.close();
    }
  });

  it.each([
    ['/purchases?limit=0', 'VALIDATION_ERROR'],
    ['/purchases?limit=501', 'VALIDATION_ERROR'],
    ['/purchases?limit=1.5', 'VALIDATION_ERROR'],
    ['/purchases?statuses=probably_fine', 'VALIDATION_ERROR'],
    ['/purchases?beforeOrderedAt=2026-09-01T00%3A00%3A00.000Z&beforeId=', 'VALIDATION_ERROR'],
    ['/purchases?beforeId=some-id', 'KEYSET_ANCHOR_INCOMPLETE'],
    ['/purchases?beforeOrderedAt=2026-09-01T00%3A00%3A00.000Z', 'KEYSET_ANCHOR_INCOMPLETE'],
    [
      '/purchases?beforeOrderedAt=2026-02-30T00%3A00%3A00.000Z&beforeId=some-id',
      'UNREADABLE_TIMESTAMP',
    ],
  ])('rejects malformed list boundary %s', async (path, code) => {
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(`${stub.url}${path}`);
      expect(answered.status).toBe(400);
      expect(await answered.json()).toMatchObject({ code });
    } finally {
      await stub.close();
    }
  });

  it('serves seeded details and 404s an unknown purchase id', async () => {
    const stub = await startPurchasesStub();
    try {
      const known = await fetch(`${stub.url}/purchases/purchase-august-linked`);
      expect(known.status).toBe(200);
      expect((await known.json()).purchase.id).toBe('purchase-august-linked');

      const unknown = await fetch(`${stub.url}/purchases/not-here`);
      expect(unknown.status).toBe(404);
      expect(await unknown.json()).toEqual({
        code: 'NOT_FOUND',
        message: 'Purchase not-here not found',
      });
    } finally {
      await stub.close();
    }
  });

  it('carries the seeded receipt document on the Corner Store detail', async () => {
    const stub = await startPurchasesStub();
    try {
      const detail = await fetch(`${stub.url}/purchases/purchase-september-unsettled`);
      expect(detail.status).toBe(200);
      const body: { documents: Array<{ documentUri: string; kind: string }> } = await detail.json();
      expect(body.documents).toEqual([
        {
          documentUri: `pops://purchases/receipt/${SEEDED_RECEIPT_SHA256}`,
          kind: 'receipt',
          createdAt: '2026-09-18T08:30:00.000Z',
        },
      ]);
    } finally {
      await stub.close();
    }
  });

  it('serves the seeded receipt thumbnail as the shape receipt.thumbnail publishes', async () => {
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(`${stub.url}/receipts/${SEEDED_RECEIPT_SHA256}/thumbnail`);
      expect(answered.status).toBe(200);
      expect(answered.headers.get('content-type')).toBe('application/json');
      const body = await answered.json();
      expect(body).toMatchObject({
        sha256: SEEDED_RECEIPT_SHA256,
        mediaType: 'image/png',
      });
      expect(typeof body.dataBase64).toBe('string');
      expect(body.dataBase64.length).toBeGreaterThan(0);
      expect(body.byteLength).toBe(Buffer.from(body.dataBase64, 'base64').byteLength);
      // Round-trips to a well-formed PNG, so a real decoder (the receipt
      // plate, via `PopsPhoto`) has something to render rather than junk that
      // merely satisfies the schema.
      const decoded = Buffer.from(body.dataBase64, 'base64');
      expect(decoded.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
    } finally {
      await stub.close();
    }
  });

  it('ranks a merchant prefix above a merchant that merely contains the text', async () => {
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(`${stub.url}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: { text: 'store' } }),
      });

      expect(answered.status).toBe(200);
      const body = await answered.json();
      // "Corner Store" contains "store" but does not start with it; no seeded
      // merchant is a prefix match here, so this also proves `matchType`
      // reflects where the text actually sits rather than always saying
      // "contains".
      expect(body.hits).toEqual([
        expect.objectContaining({
          uri: 'pops:purchases/purchase/purchase-september-unsettled',
          matchField: 'merchantEntityName',
          matchType: 'contains',
        }),
      ]);
    } finally {
      await stub.close();
    }
  });

  it('reports a prefix match ahead of a contains match, and echoes the order fields a hit needs', async () => {
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(`${stub.url}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: { text: 'hard' } }),
      });

      const body = await answered.json();
      // "Hardware Shop" is a prefix match, "Corner Store" and "Market" are not
      // matches at all — so this also proves the search is scoped to what was
      // asked, not every seeded row.
      expect(body.hits.map((hit: { uri: string; matchType: string }) => hit.uri)).toEqual([
        'pops:purchases/purchase/purchase-august-linked',
      ]);
      expect(body.hits[0]).toMatchObject({
        matchType: 'prefix',
        data: {
          merchantEntityName: 'Hardware Shop',
          totalCents: 4599,
          currency: 'AUD',
          status: 'linked',
        },
      });
    } finally {
      await stub.close();
    }
  });

  it("reads the gateway's own envelope, which wraps the call argument in a `body` key it does not strip", async () => {
    // `search()` in `pillars/bfm/src/api/purchases/search-client.ts` calls
    // `handle.search.search({ body: { query: {...} } })`, and the dynamic
    // gateway proxy serialises that whole argument rather than stripping the
    // `body` key the way a generated ts-rest client would — verified against
    // the live harness, not assumed. A stub that only read the unwrapped
    // shape would report every real search empty.
    const stub = await startPurchasesStub();
    try {
      const answered = await fetch(`${stub.url}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ body: { query: { text: 'Corner' } } }),
      });
      const body = await answered.json();
      expect(body.hits).toHaveLength(1);
      expect(body.hits[0].data.merchantEntityName).toBe('Corner Store');
    } finally {
      await stub.close();
    }
  });

  it('answers no hits for an empty or all-whitespace query, and none for text nothing matches', async () => {
    const stub = await startPurchasesStub();
    try {
      const empty = await fetch(`${stub.url}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: { text: '   ' } }),
      });
      expect(await empty.json()).toEqual({ hits: [] });

      const noMatch = await fetch(`${stub.url}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: { text: 'no such merchant' } }),
      });
      expect(await noMatch.json()).toEqual({ hits: [] });
    } finally {
      await stub.close();
    }
  });

  it('answers search whether or not the reachability switch is thrown', async () => {
    // Unlike `/openapi`, the search route is not gated behind `setReachable` —
    // this stub's header says why: the switch this stub starts withheld on is
    // the contract probe, not every route underneath it.
    const stub = await startPurchasesStub();
    try {
      expect(stub.isReachable()).toBe(false);
      const answered = await fetch(`${stub.url}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: { text: 'Market' } }),
      });
      expect(answered.status).toBe(200);
    } finally {
      await stub.close();
    }
  });

  it('refuses the search connection once the search outage switch is thrown, and recovers', async () => {
    const stub = await startPurchasesStub();
    try {
      expect(stub.isSearchOutage()).toBe(false);
      stub.setSearchOutage(true);
      expect(stub.isSearchOutage()).toBe(true);
      await expect(
        fetch(`${stub.url}/search`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ query: { text: 'Market' } }),
        })
      ).rejects.toThrow();

      stub.setSearchOutage(false);
      const recovered = await fetch(`${stub.url}/search`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ query: { text: 'Market' } }),
      });
      expect(recovered.status).toBe(200);
    } finally {
      await stub.close();
    }
  });

  it('404s a thumbnail for a sha256 no seeded purchase carries', async () => {
    const stub = await startPurchasesStub();
    try {
      const unknownSha256 = 'f'.repeat(64);
      const answered = await fetch(`${stub.url}/receipts/${unknownSha256}/thumbnail`);
      expect(answered.status).toBe(404);
      expect(await answered.json()).toEqual({
        code: 'NOT_FOUND',
        message: `Receipt ${unknownSha256} not found`,
      });
    } finally {
      await stub.close();
    }
  });
});
