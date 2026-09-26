import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openCerebrumDb, type OpenedCerebrumDb } from '../../db/index.js';
import { createCerebrumApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';
import { makeCerebrumApiDeps } from './test-utils.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let cerebrumDb: OpenedCerebrumDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'cerebrum-errors-test-'));
  cerebrumDb = openCerebrumDb(join(tmpDir, 'cerebrum.db'));
});

afterEach(() => {
  if (cerebrumDb.raw.open) cerebrumDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app() {
  return createCerebrumApiApp(makeCerebrumApiDeps({ cerebrumDb, tmpDir }));
}

describe('ADR-054 errors', () => {
  it('maps ts-rest validation failures and echoes the request ID', async () => {
    const response = await requestOn(app())
      .post('/emit/report')
      .set('X-Request-Id', 'cerebrum-request-id')
      .send({});

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toBe('cerebrum-request-id');
    expect(response.body).toMatchObject({
      code: 'cerebrum.request.invalid',
      message: 'The request is invalid.',
      requestId: 'cerebrum-request-id',
      retryable: false,
      details: { issues: expect.any(Array) },
    });
  });

  it('returns a JSON envelope for unmatched routes', async () => {
    const response = await requestOn(app()).get('/not-a-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'cerebrum.route.not_found',
      message: 'The requested route was not found.',
      requestId: response.headers['x-request-id'],
      retryable: false,
    });
  });

  it('redacts an unmapped failure', async () => {
    const target = app();
    cerebrumDb.raw.close();
    const response = await requestOn(target).get('/health');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'cerebrum.internal.failure',
      message: 'The service could not complete the request.',
      requestId: response.headers['x-request-id'],
      retryable: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('database');
  });
});
