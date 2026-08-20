import { describe, expect, it } from 'vitest';

import { createDocumentsApiApp } from '../app.js';
/**
 * Smoke tests for the documents-api Express app + health probe.
 *
 * The documents pillar owns no DB, so unlike the data pillars there is no
 * "fails closed when the handle is closed" case — health is a pure
 * liveness shape.
 */
import { createTestTransport } from './test-http.js';

const { requestOn } = createTestTransport();

describe('GET /health', () => {
  it('returns ok + status + pillar + version + ts', async () => {
    const app = createDocumentsApiApp({
      version: '0.0.1-test',
      selfBaseUrl: 'http://localhost:3012',
    });
    const res = await requestOn(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      ok: true,
      status: 'ok',
      pillar: 'documents',
      version: '0.0.1-test',
      ts: expect.any(String),
    });
    expect(new Date(res.body.ts as string).toISOString()).toBe(res.body.ts);
  });
});
