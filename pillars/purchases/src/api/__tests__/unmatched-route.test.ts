/**
 * A request that reaches no route must answer a body a caller can read and
 * leave a server-side trace, and mounting a handler that matches every method
 * last must not change what a real route does — including the automatic
 * `OPTIONS`/`Allow` response Express builds only when every layer declines.
 */
import express from 'express';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { amazonOrder, openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
import { createPurchasesApiApp } from '../app.js';
import { unmatchedRouteHandler } from '../middleware/unmatched-route.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

const { requestOn } = createTestTransport();

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  seedAmazonSource(opened);
  __resetPillarRegistryCache();
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  app = createPurchasesApiApp({
    vision: null,
    purchasesDb: opened,
    version: '1.2.3',
    selfBaseUrl: 'http://localhost:3013',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  __resetPillarRegistryCache();
});

describe('a request that matches no route', () => {
  it('answers 404 with a readable JSON body instead of an empty one', async () => {
    const res = await requestOn(app).post('/purchases/does-not-exist/nested');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.message).toContain('POST');
    expect(res.body.message).toContain('/purchases/does-not-exist/nested');
  });

  it('logs the method and path server-side', async () => {
    await requestOn(app).get('/no-such-route');

    expect(errorSpy).toHaveBeenCalledWith(
      '[purchases-api] no route matched',
      expect.objectContaining({ method: 'GET', path: '/no-such-route' })
    );
  });

  it('logs the path without the query string it was called with', async () => {
    await requestOn(app).get('/no-such-route?q=coffee%20grinder&token=hunter2');

    expect(errorSpy).toHaveBeenCalledWith(
      '[purchases-api] no route matched',
      expect.objectContaining({ path: '/no-such-route' })
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('hunter2');
  });
});

describe('mounting it last', () => {
  it('does not shadow a real route', async () => {
    await requestOn(app).get('/health').expect(200);
    await requestOn(app).get('/purchases').expect(200);
    await requestOn(app).post('/purchases').send(amazonOrder()).expect(201);

    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('leaves the automatic OPTIONS response on a real route intact', async () => {
    const res = await requestOn(app).options('/purchases');

    expect(res.status).toBe(200);
    expect(res.headers['allow']).toContain('GET');
    expect(res.headers['allow']).toContain('POST');
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it('declines rather than answering twice when an earlier layer already responded', async () => {
    const responded = express();
    responded.use((_req, res, next) => {
      res.status(202).json({ code: 'ALREADY_ANSWERED' });
      next();
    });
    responded.use(unmatchedRouteHandler);

    const res = await requestOn(responded).get('/anything');

    expect(res.status).toBe(202);
    expect(res.body).toMatchObject({ code: 'ALREADY_ANSWERED' });
    expect(errorSpy).not.toHaveBeenCalled();
  });
});
