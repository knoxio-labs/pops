/**
 * Integration tests for `GET /service-accounts/self` — the introspection route
 * every other pillar depends on to enforce a scope it cannot check itself.
 *
 * The contract other producers rely on is narrow and load-bearing: a live key
 * yields its principal (including the scopes verbatim), and everything else —
 * no key, a garbage key, a revoked key — yields a 401 so the asking pillar
 * fails closed rather than admitting the caller.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { REGISTRY_SERVICE_ACCOUNT_SELF_PATH } from '@pops/pillar-sdk';

import { openCoreDb, type OpenedCoreDb } from '../../db/index.js';
import { createCoreApiApp } from '../app.js';
import { makeClient } from './test-utils.js';

let tmpDir: string;
let coreDb: OpenedCoreDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'core-api-sa-self-test-'));
  coreDb = openCoreDb(join(tmpDir, 'core.db'));
});

afterEach(() => {
  coreDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app(): ReturnType<typeof createCoreApiApp> {
  return createCoreApiApp({ coreDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3001' });
}

async function mintKey(name: string, scopes: string[]): Promise<{ id: string; key: string }> {
  const created = await makeClient(app()).serviceAccounts.create({ name, scopes });
  return { id: created.id, key: created.plaintextKey };
}

describe('GET /service-accounts/self', () => {
  it('returns the principal behind a live key, scopes verbatim', async () => {
    const { id, key } = await mintKey('bfm', ['finance.transactions', 'core.settings']);

    const response = await request(app())
      .get(REGISTRY_SERVICE_ACCOUNT_SELF_PATH)
      .set('x-api-key', key);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      id,
      name: 'bfm',
      scopes: ['finance.transactions', 'core.settings'],
    });
  });

  it('401s a request with no key, even under the dev-user fallback', async () => {
    const response = await request(app()).get(REGISTRY_SERVICE_ACCOUNT_SELF_PATH);
    expect(response.status).toBe(401);
  });

  it('401s a well-formed key that matches no account', async () => {
    const response = await request(app())
      .get(REGISTRY_SERVICE_ACCOUNT_SELF_PATH)
      .set('x-api-key', 'pops_sa_deadbeef.not-a-real-secret-value-000000');
    expect(response.status).toBe(401);
  });

  it('401s a key whose account has been revoked', async () => {
    const { id, key } = await mintKey('revoked-caller', ['finance.transactions']);
    await expect(
      request(app()).get(REGISTRY_SERVICE_ACCOUNT_SELF_PATH).set('x-api-key', key)
    ).resolves.toMatchObject({ status: 200 });

    await makeClient(app()).serviceAccounts.revoke(id);

    const response = await request(app())
      .get(REGISTRY_SERVICE_ACCOUNT_SELF_PATH)
      .set('x-api-key', key);
    expect(response.status).toBe(401);
  });

  it('never echoes the presented key back', async () => {
    const { key } = await mintKey('echo-check', ['finance.transactions']);
    const response = await request(app())
      .get(REGISTRY_SERVICE_ACCOUNT_SELF_PATH)
      .set('x-api-key', key);
    expect(response.text).not.toContain(key);
  });
});
