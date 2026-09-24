import { afterEach, describe, expect, it } from 'vitest';

/**
 * `searchPurchases` and `purchaseTags`.
 *
 * The mapping under test is narrow — both call one client method and turn a
 * gateway failure into the COLLECTION upstream shape, mirroring
 * `listPurchases`'s own test for the same reason: an empty search or an
 * empty vocabulary is a real answer ("nothing matched" / "nothing tagged
 * yet"), never a 404, and a producer 404 must not leak through as one.
 *
 * The closed `status` enum's 400 is defended end to end through the real
 * app instead, in its own describe block below: it is ts-rest's own request
 * validation rejecting the query before any handler runs, which a handler
 * called directly cannot exercise.
 */
import { fakePillarHandle } from '@pops/pillar-sdk/testing';

import { deviceRow } from '../../../db/__tests__/helpers.js';
import { devices } from '../../../db/index.js';
import { createTestApp, type TestApp } from '../../__tests__/harness.js';
import { requestOn } from '../../__tests__/test-http.js';
import { mintAccessToken } from '../../auth/access-token.js';
import { createPillarGateway } from '../../pillars/gateway.js';
import { createMobilePurchasesClient, type MobilePurchasesClient } from '../../purchases/client.js';
import { makeMobilePurchasesSearchHandlers } from '../mobile-purchases-search-handlers.js';

import type { Express } from 'express';

import type {
  MobilePurchaseSearchResponse,
  MobilePurchaseTagsResponse,
} from '../../../contract/mobile-purchases-schemas.js';
import type { GatewayOutcome } from '../../pillars/gateway.js';
import type { PillarHandleFactory } from '../../pillars/gateway.js';

function stubClient(overrides: Partial<MobilePurchasesClient>): MobilePurchasesClient {
  const notExercised = () => {
    throw new Error('not exercised by this suite');
  };
  return {
    extractReceipt: notExercised,
    saveReceiptDraft: notExercised,
    createManualPurchase: notExercised,
    listPurchases: notExercised,
    getPurchase: notExercised,
    updatePurchase: notExercised,
    getReceipt: notExercised,
    getReceiptThumbnail: notExercised,
    getMonthSummary: notExercised,
    search: notExercised,
    tagVocabulary: notExercised,
    ...overrides,
  };
}

const UNAVAILABLE: GatewayOutcome<never> = {
  kind: 'unavailable',
  pillar: 'purchases',
  status: 503,
};

describe('searchPurchases', () => {
  it('answers the client’s hits on success', async () => {
    const value: MobilePurchaseSearchResponse = { hits: [] };
    const handlers = makeMobilePurchasesSearchHandlers(
      stubClient({ search: () => Promise.resolve({ kind: 'ok', value }) })
    );

    const response = await handlers.searchPurchases({
      query: { q: 'bunnings' },
    } as Parameters<typeof handlers.searchPurchases>[0]);

    expect(response).toEqual({ status: 200, body: value });
  });

  it('maps a gateway failure to the collection upstream shape, not a 404', async () => {
    const handlers = makeMobilePurchasesSearchHandlers(
      stubClient({ search: () => Promise.resolve(UNAVAILABLE) })
    );

    const response = await handlers.searchPurchases({
      query: { q: 'bunnings' },
    } as Parameters<typeof handlers.searchPurchases>[0]);

    expect(response.status).toBe(503);
  });
});

describe('purchaseTags', () => {
  it('answers the client’s vocabulary on success', async () => {
    const value: MobilePurchaseTagsResponse = { tags: [{ tag: 'snack', count: 3 }] };
    const handlers = makeMobilePurchasesSearchHandlers(
      stubClient({ tagVocabulary: () => Promise.resolve({ kind: 'ok', value }) })
    );

    const response = await handlers.purchaseTags();

    expect(response).toEqual({ status: 200, body: value });
  });

  it('maps a gateway failure to the collection upstream shape, not a 404', async () => {
    const handlers = makeMobilePurchasesSearchHandlers(
      stubClient({ tagVocabulary: () => Promise.resolve(UNAVAILABLE) })
    );

    const response = await handlers.purchaseTags();

    expect(response.status).toBe(503);
  });
});

const apps: TestApp[] = [];

afterEach(() => {
  while (apps.length > 0) apps.pop()?.cleanup();
});

function unreachableHandleFactory<TRouter>(): TRouter {
  throw new Error('not exercised by this suite');
}

function openWith(factory: PillarHandleFactory): { app: Express; token: string } {
  const created = createTestApp({
    purchases: createMobilePurchasesClient(createPillarGateway(factory)),
  });
  apps.push(created);

  const row = deviceRow();
  created.db.insert(devices).values(row).run();
  const { token } = mintAccessToken(row.id, created.accessTokenSigningKey);

  return { app: created.app, token };
}

describe('GET /mobile/purchases/search — an unrecognised status', () => {
  it('is a 400 from the route itself, never a round trip to purchases', async () => {
    const { app, token } = openWith(unreachableHandleFactory as unknown as PillarHandleFactory);

    const response = await requestOn(app, (r) =>
      r
        .get('/mobile/purchases/search?q=bunnings&status=not-a-real-status')
        .set('Authorization', `Bearer ${token}`)
    );

    expect(response.status).toBe(400);
  });
});

/**
 * The regression this whole suite exists to catch: `/mobile/purchases/:id`
 * (`getPurchase`) swallowing `/mobile/purchases/search` and
 * `/mobile/purchases/tags` as an id, because `createExpressEndpoints`
 * registers routes in the HANDLERS object's own key order rather than the
 * contract's — see `mobile-purchases-handlers.ts`'s comment on this exact
 * trap.
 *
 * The factory below answers `search.search` and `purchase.tagVocabulary`
 * but deliberately does NOT implement `purchase.get`: if either route were
 * still misrouted to `getPurchase`, the fake would throw
 * "not exercised by this suite" and the request would 500 — a plain 200
 * from `getPurchase("search")` would prove nothing about which handler
 * actually ran.
 */
describe('route ordering: the fixed segments are not swallowed by :id', () => {
  function factoryWithNoGetPurchase(): PillarHandleFactory {
    return (<TRouter>(pillarId: string) =>
      fakePillarHandle<TRouter>(pillarId, {
        search: { search: () => ({ kind: 'ok', value: { hits: [] } }) },
        purchase: { tagVocabulary: () => ({ kind: 'ok', value: { tags: [] } }) },
      })) as PillarHandleFactory;
  }

  it('reaches searchPurchases rather than getPurchase("search")', async () => {
    const { app, token } = openWith(factoryWithNoGetPurchase());

    const response = await requestOn(app, (r) =>
      r.get('/mobile/purchases/search?q=bunnings').set('Authorization', `Bearer ${token}`)
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ hits: [] });
  });

  it('reaches purchaseTags rather than getPurchase("tags")', async () => {
    const { app, token } = openWith(factoryWithNoGetPurchase());

    const response = await requestOn(app, (r) =>
      r.get('/mobile/purchases/tags').set('Authorization', `Bearer ${token}`)
    );

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ tags: [] });
  });
});
