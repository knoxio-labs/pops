/**
 * A too-large body over HTTP, exercised for real.
 *
 * `express.json()`'s own 413 is thrown deep inside `body-parser`'s stream
 * reader, so a mock of anything this pillar owns would prove nothing about
 * whether that failure actually reaches `jsonBodyErrorHandler` — only a real
 * oversized request over `supertest` does. The pass-through case below is
 * driven the same way, through a real Express app, so the handler is proven
 * against Express's actual `Response`/`NextFunction` rather than a hand-typed
 * stand-in for them.
 */
import express from 'express';
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb } from '../../db/__tests__/helpers.js';
import { JSON_BODY_LIMIT_BYTES, createPurchasesApiApp } from '../app.js';
import { jsonBodyErrorHandler } from '../middleware/json-body-error.js';
import { __resetPillarRegistryCache } from '../pillars/registry.js';

import type { Express } from 'express';

import type { OpenedPurchasesDb } from '../../db/index.js';

let opened: OpenedPurchasesDb;
let cleanup: () => void;
let app: Express;

beforeEach(() => {
  ({ opened, cleanup } = openTempDb());
  __resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
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

describe('a body over the JSON limit', () => {
  it('answers a readable JSON body instead of an HTML error page', async () => {
    // Pad the payload to just past the pillar's configured limit rather
    // than hardcoding a second magic size: the test stays meaningful (and
    // fast) even if JSON_BODY_LIMIT_BYTES changes.
    const marginBytes = 1024;
    const bodyWithoutNote = {
      source: 'amazon',
      ingestMethod: 'export',
      orderedAt: '2026-02-02T01:41:21Z',
      currency: 'AUD',
      totalCents: 100,
      checksum: 'oversized',
      note: '',
    };
    const baseSize = Buffer.byteLength(JSON.stringify(bodyWithoutNote));
    const oversizedNote = 'x'.repeat(JSON_BODY_LIMIT_BYTES - baseSize + marginBytes);
    const res = await request(app)
      .post('/purchases')
      .send({
        ...bodyWithoutNote,
        note: oversizedNote,
      });

    expect(res.status).toBe(413);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});

describe('an error that is not a body-parser failure', () => {
  it('is passed through to the next handler unchanged, not answered here', async () => {
    const unrelated = express();
    unrelated.get('/boom', (_req, _res, next) => {
      next(new Error('something unrelated went wrong'));
    });
    unrelated.use(jsonBodyErrorHandler);
    // Proves the handler declined the error rather than swallowing it:
    // this only runs if `jsonBodyErrorHandler` called `next(err)`.
    unrelated.use(
      (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
        res.status(599).json({ passedThrough: err instanceof Error ? err.message : String(err) });
      }
    );

    const res = await request(unrelated).get('/boom');

    expect(res.status).toBe(599);
    expect(res.body).toEqual({ passedThrough: 'something unrelated went wrong' });
  });
});
