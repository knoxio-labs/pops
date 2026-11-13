import { describe, expect, it } from 'vitest';

import { createDocumentsApiApp } from '../app.js';
/**
 * Smoke tests for the documents-api Express app + health probe.
 *
 * Production checks its private upload ledger independently of Paperless.
 */
import { createTestTransport } from './test-http.js';

const { requestOn } = createTestTransport();

describe('GET /health', () => {
  it('fails when the production ledger probe is unavailable', async () => {
    const app = createDocumentsApiApp({
      version: 'test',
      selfBaseUrl: 'http://localhost:3012',
      checkStorage: () => {
        throw new Error('Closed ledger');
      },
    });
    expect((await requestOn(app).get('/health')).status).toBe(500);
  });
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
