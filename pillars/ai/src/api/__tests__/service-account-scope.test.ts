/**
 * Integration tests for ai's inbound service-account gate, driven through the
 * real Express app (POPS-4130).
 *
 * The load-bearing case is the no-credential one: every existing ai route's
 * real callers — the shell's browser traffic, and the internal-credentialled
 * telemetry senders on `/ai-usage/record` — present no `X-API-Key`, so this
 * asserts they keep working exactly as before this gate existed. The
 * credentialled cases are `codes/rank`'s own contract: inventory's
 * `codes/suggest` is the first (and, today, only) caller to present one.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openAiDb, type OpenedAiDb } from '../../db/index.js';
import { createAiApiApp } from '../app.js';
import { aiScopeMap } from '../middleware/service-account-scope.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const { requestOn } = createTestTransport();

const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

let tmpDir: string;
let aiDb: OpenedAiDb;

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

const grantedScopes = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_inventory', name: 'pops_api_key', scopes },
});

function app(verify: ServiceAccountVerifier): Express {
  return createAiApiApp({
    aiDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3008',
    serviceAccountVerifier: verify,
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ai-api-scope-test-'));
  aiDb = openAiDb(join(tmpDir, 'ai.db'));
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  aiDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

describe('the ai scope map', () => {
  it('covers the whole contract, so no route is gated by an empty table', () => {
    expect(aiScopeMap.routes.length).toBeGreaterThan(0);
    expect(aiScopeMap.routes.every((route) => route.scope.startsWith('ai.'))).toBe(true);
  });

  it('names ai.codes.rank for the new route', () => {
    expect(aiScopeMap.routes.map((route) => route.scope)).toContain('ai.codes.rank');
  });
});

describe('a request with no credential', () => {
  it('reaches /codes/rank without one — the ADR-044 default posture', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify))
      .post('/codes/rank')
      .send({ name: 'Widget', candidates: ['ABC001'] });

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });

  it('reaches an existing AI-ops route without one, exactly as before this gate existed', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/ai-usage/stats');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a live credential whose grant does not cover the operation', () => {
  it('403s an account granted a neighbouring scope', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['ai.aiUsage']))))
      .post('/codes/rank')
      .set('x-api-key', KEY)
      .send({ name: 'Widget', candidates: ['ABC001'] });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ message: expect.stringContaining('not authorised') });
  });

  it('names the account and the missing scope so the grant can be widened', async () => {
    const warn = vi.spyOn(console, 'warn');
    await requestOn(app(verifierReturning(grantedScopes(['ai.aiUsage']))))
      .post('/codes/rank')
      .set('x-api-key', KEY)
      .send({ name: 'Widget', candidates: ['ABC001'] });

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('pops_api_key');
    expect(logged).toContain('ai.codes.rank');
    expect(logged).not.toContain(KEY);
  });
});

describe('a live credential whose grant covers the operation', () => {
  it('admits an account scoped exactly to ai.codes.rank', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['ai.codes.rank']))))
      .post('/codes/rank')
      .set('x-api-key', KEY)
      .send({ name: 'Widget', candidates: ['ABC001'] });

    expect(response.status).toBe(200);
  });

  it('matches by dot prefix — a plain "ai" grant covers it too', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['ai']))))
      .post('/codes/rank')
      .set('x-api-key', KEY)
      .send({ name: 'Widget', candidates: ['ABC001'] });

    expect(response.status).toBe(200);
  });
});

describe('failing closed', () => {
  it('401s a key the registry does not recognise, rather than falling back to network trust', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .post('/codes/rank')
      .set('x-api-key', KEY)
      .send({ name: 'Widget', candidates: ['ABC001'] });

    expect(response.status).toBe(401);
  });

  it('503s rather than admitting a caller it could not verify', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED' }))
    )
      .post('/codes/rank')
      .set('x-api-key', KEY)
      .send({ name: 'Widget', candidates: ['ABC001'] });

    expect(response.status).toBe(503);
  });
});

describe('paths outside the contract', () => {
  it('does not gate the health probe, even with a rejected key', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/health')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('does not gate the OpenAPI projection', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/openapi').set('x-api-key', KEY);

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});
