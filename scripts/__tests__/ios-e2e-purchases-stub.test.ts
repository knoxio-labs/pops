import { describe, expect, it } from 'vitest';

import {
  PURCHASES_PILLAR_ID,
  UPLOAD_OPERATION_ID,
  purchasesRegistryEntry,
  readPurchasesContract,
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
});
