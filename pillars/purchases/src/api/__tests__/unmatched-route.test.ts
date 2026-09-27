/**
 * A request that reaches no route must answer a body a caller can read and
 * leave a server-side trace, and mounting a handler that matches every method
 * last must not change what a real route does — including the automatic
 * `OPTIONS`/`Allow` response Express builds only when every layer declines.
 */
import express from 'express';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createRequestIdMiddleware, createUnmatchedRouteHandler } from '@pops/pillar-express';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  app = createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
  });
});

afterEach(() => {
  cleanup();
  __resetPillarRegistryCache();
});

describe('a request that matches no route', () => {
  it('answers 404 with a readable JSON body instead of an empty one', async () => {
    const res = await requestOn(app).post('/purchases/does-not-exist/nested');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toMatchObject({
      code: 'purchases.route.not_found',
      message: 'The requested route was not found.',
      requestId: expect.any(String),
      retryable: false,
    });
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('echoes an incoming request id in the header and envelope', async () => {
    const res = await requestOn(app).get('/no-such-route').set('X-Request-Id', 'request-4877');

    expect(res.headers['x-request-id']).toBe('request-4877');
    expect(res.body.requestId).toBe('request-4877');
  });
});

describe('mounting it last', () => {
  it('does not shadow a real route', async () => {
    await requestOn(app).get('/health').expect(200);
    await requestOn(app).get('/purchases').expect(200);
    await requestOn(app).post('/purchases').send(amazonOrder()).expect(201);
  });

  it('leaves the automatic OPTIONS response on a real route intact', async () => {
    const res = await requestOn(app).options('/purchases');

    expect(res.status).toBe(200);
    expect(res.headers['allow']).toContain('GET');
    expect(res.headers['allow']).toContain('POST');
  });

  it('declines rather than answering twice when an earlier layer already responded', async () => {
    const responded = express();
    responded.use(createRequestIdMiddleware());
    responded.use((_req, res, next) => {
      res.status(202).json({ code: 'ALREADY_ANSWERED' });
      next();
    });
    responded.use(createUnmatchedRouteHandler({ pillar: 'purchases' }));

    const res = await requestOn(responded).get('/anything');

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ code: 'ALREADY_ANSWERED' });
  });
});
