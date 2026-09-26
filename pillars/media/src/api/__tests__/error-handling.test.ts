import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let mediaDb: OpenedMediaDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-errors-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  if (mediaDb.raw.open) mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app() {
  return createMediaApiApp({
    mediaDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3003',
  });
}

describe('ADR-054 errors', () => {
  it('maps ts-rest validation failures and echoes the request ID', async () => {
    const response = await requestOn(app())
      .post('/movies')
      .set('X-Request-Id', 'media-request-id')
      .send({});

    expect(response.status).toBe(400);
    expect(response.headers['x-request-id']).toBe('media-request-id');
    expect(response.body).toMatchObject({
      code: 'media.request.invalid',
      message: 'The request is invalid.',
      requestId: 'media-request-id',
      retryable: false,
      details: { issues: expect.any(Array) },
    });
  });

  it('returns a JSON envelope for unmatched routes', async () => {
    const response = await requestOn(app()).get('/not-a-route');

    expect(response.status).toBe(404);
    expect(response.body).toEqual({
      code: 'media.route.not_found',
      message: 'The requested route was not found.',
      requestId: response.headers['x-request-id'],
      retryable: false,
    });
  });

  it('redacts an unmapped failure', async () => {
    const target = app();
    mediaDb.raw.close();
    const response = await requestOn(target).get('/health');

    expect(response.status).toBe(500);
    expect(response.body).toEqual({
      code: 'media.internal.failure',
      message: 'The service could not complete the request.',
      requestId: response.headers['x-request-id'],
      retryable: false,
    });
    expect(JSON.stringify(response.body)).not.toContain('database');
  });
});
