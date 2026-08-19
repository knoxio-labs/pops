/**
 * POPS-1312: a 404 from this pillar must be loud, not silent.
 *
 * A real backfill saw one `POST /purchases` in 748 answer 404 with an
 * empty body, never reproduced and most likely a `supertest`
 * ephemeral-listener artefact rather than a defect in the write path (see
 * the ticket). Whatever the cause, the pillar had nothing to show for it
 * afterwards — this closes that gap: any unmatched route now logs
 * server-side and answers a body a caller (and `scripts/backfill.ts`,
 * which prints `response.text()` on a non-201/409) can actually read.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { createPurchasesApiApp } from '../app.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
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
    const res = await request(app).post('/purchases/does-not-exist/nested');

    expect(res.status).toBe(404);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toMatchObject({ code: 'NOT_FOUND' });
    expect(res.body.message).toContain('POST');
    expect(res.body.message).toContain('/purchases/does-not-exist/nested');
  });

  it('logs the method and path server-side', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await request(app).get('/no-such-route');

    expect(errorSpy).toHaveBeenCalledWith(
      '[purchases-api] no route matched',
      expect.objectContaining({ method: 'GET', path: '/no-such-route' })
    );
    errorSpy.mockRestore();
  });

  it('does not shadow a real route', async () => {
    await request(app).get('/health').expect(200);
    await request(app).get('/purchases').expect(200);
  });
});
