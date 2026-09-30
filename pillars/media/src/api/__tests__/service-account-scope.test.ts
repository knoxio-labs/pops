import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openMediaDb, type OpenedMediaDb } from '../../db/index.js';
import { createMediaApiApp } from '../app.js';
import { mediaScopeMap } from '../middleware/service-account-scope.js';
import { createTestTransport } from './test-http.js';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

let tmpDir: string;
let mediaDb: OpenedMediaDb;

const { requestOn } = createTestTransport();
const PROVIDED_KEY = 'provided-key';

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'media-api-sa-scope-test-'));
  mediaDb = openMediaDb(join(tmpDir, 'media.db'));
});

afterEach(() => {
  vi.restoreAllMocks();
  mediaDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

function grantedScopes(scopes: readonly string[]): ServiceAccountVerification {
  return {
    outcome: 'authenticated',
    principal: { id: 'sa_media_test', name: 'media-test', scopes },
  };
}

function app(verify: ServiceAccountVerifier) {
  return createMediaApiApp({
    mediaDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3003',
    serviceAccountVerifier: verify,
  });
}

describe('media scope map', () => {
  it('covers contract operations with media scopes', () => {
    expect(mediaScopeMap.routes.length).toBeGreaterThan(10);
    expect(mediaScopeMap.routes.every((route) => route.scope.startsWith('media.'))).toBe(true);
  });
});

describe('a request with no credential', () => {
  it('reaches the handler without invoking the verifier', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/movies');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a presented credential', () => {
  it('rejects an unknown key with 401', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/movies')
      .set('x-api-key', PROVIDED_KEY);

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ code: 'media.auth.invalid', retryable: false });
  });

  it('rejects a grant that does not cover the operation with 403', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const response = await requestOn(app(verifierReturning(grantedScopes(['media.watchlist']))))
      .get('/movies')
      .set('x-api-key', PROVIDED_KEY);

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ code: 'media.auth.forbidden', retryable: false });
    const log = warn.mock.calls.flat().join(' ');
    expect(log).toContain('media-test');
    expect(log).toContain('media.movies.list');
    expect(log).not.toContain(PROVIDED_KEY);
  });

  it('admits a grant that covers the operation', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['media.movies']))))
      .get('/movies')
      .set('x-api-key', PROVIDED_KEY);

    expect(response.status).toBe(200);
  });

  it('fails closed with 503 when the registry is unavailable', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'registry is unreachable' }))
    )
      .get('/movies')
      .set('x-api-key', PROVIDED_KEY);

    expect(response.status).toBe(503);
    expect(response.body).toMatchObject({ code: 'media.auth.unavailable', retryable: true });
    expect(response.text).not.toContain('registry is unreachable');
  });

  it('leaves probes, the OpenAPI projection, and raw image routes outside the gate', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const client = requestOn(app(verify));

    const health = await client.get('/health').set('x-api-key', PROVIDED_KEY);
    const openapi = await client.get('/openapi').set('x-api-key', PROVIDED_KEY);
    const image = await client
      .get('/media/images/unknown/123/poster.jpg')
      .set('x-api-key', PROVIDED_KEY);

    expect(health.status).toBe(200);
    expect(openapi.status).toBe(200);
    expect(image.status).toBe(400);
    expect(verify).not.toHaveBeenCalled();
  });
});
