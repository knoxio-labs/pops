import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-errors-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
});

afterEach(() => {
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function app(identityResolver?: () => Promise<never>) {
  return createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    ...(identityResolver === undefined ? {} : { identityResolver }),
  });
}

describe('ADR-054 error envelope', () => {
  it('echoes a caller request ID and mints one when absent', async () => {
    const supplied = await requestOn(app()).get('/health').set('X-Request-Id', 'request-from-edge');
    const minted = await requestOn(app()).get('/health');

    expect(supplied.headers['x-request-id']).toBe('request-from-edge');
    expect(minted.headers['x-request-id']).toEqual(expect.any(String));
    expect(minted.headers['x-request-id']).not.toBe('');
  });

  it('returns a JSON envelope for an unknown route', async () => {
    const response = await requestOn(app()).get('/route-that-does-not-exist');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'inventory.route.not_found',
      message: 'The requested route was not found.',
      requestId: response.headers['x-request-id'],
      retryable: false,
    });
  });

  it('redacts an unmapped error and retains only its request ID in the response', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const response = await requestOn(
      app(async () => {
        throw new Error('database password and stack must not escape');
      })
    ).get('/items');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'inventory.internal',
      message: 'The service could not complete the request.',
      requestId: response.headers['x-request-id'],
      retryable: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('database password');
    expect(JSON.stringify(response.body)).not.toContain('stack');
  });
});
