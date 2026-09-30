import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTempDb, seedAmazonSource } from '../../db/__tests__/helpers.js';
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

describe('POST /purchases under SQLite contention', () => {
  it('returns a retryable JSON 503 when another connection holds the writer lock', async () => {
    opened.raw.pragma('busy_timeout = 50');
    const blockingConnection = new Database(opened.raw.name);

    try {
      blockingConnection.exec('BEGIN IMMEDIATE');

      const response = await requestOn(app).post('/purchases').send({
        source: 'amazon',
        sourceOrderId: '249-1512883-0105415',
        ingestMethod: 'export',
        orderedAt: '2026-02-02T01:41:21Z',
        currency: 'AUD',
        totalCents: 5678,
        checksum: 'lock-contention',
      });

      expect(response.status).toBe(503);
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['retry-after']).toBe('5');
      expect(response.body).toMatchObject({
        code: 'purchases.storage.database_busy',
        message: 'Purchase storage is busy. Retry this request shortly.',
        retryable: true,
      });
    } finally {
      if (blockingConnection.inTransaction) blockingConnection.exec('ROLLBACK');
      blockingConnection.close();
    }
  });
});
