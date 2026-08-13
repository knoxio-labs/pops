/**
 * A too-large body over HTTP, exercised for real.
 *
 * `express.json()`'s own 413 is thrown deep inside `body-parser`'s stream
 * reader, so a mock of anything this pillar owns would prove nothing about
 * whether that failure actually reaches `jsonBodyErrorHandler` — only a real
 * oversized request over `supertest` does.
 */
import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
    // 20mb is the pillar's configured limit; a receipt with a couple of
    // oversized photographs clears it easily.
    const oversizedNote = 'x'.repeat(21 * 1024 * 1024);
    const res = await request(app).post('/purchases').send({
      source: 'amazon',
      ingestMethod: 'export',
      orderedAt: '2026-02-02T01:41:21Z',
      currency: 'AUD',
      totalCents: 100,
      checksum: 'oversized',
      note: oversizedNote,
    });

    expect(res.status).toBe(413);
    expect(res.headers['content-type']).toMatch(/^application\/json/);
    expect(res.body).toMatchObject({ code: 'PAYLOAD_TOO_LARGE' });
    expect(typeof res.body.message).toBe('string');
    expect(res.body.message.length).toBeGreaterThan(0);
  });
});
