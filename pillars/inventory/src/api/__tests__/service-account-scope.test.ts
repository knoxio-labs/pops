/**
 * Integration tests for inventory's inbound service-account gate, driven
 * through the real Express app.
 *
 * The four cases that decide whether the gate is worth anything: no
 * credential, a credential the registry rejects, a live credential whose
 * grant does not cover the operation, and a live credential that does. Plus
 * the one that decides whether it fails closed: a registry that cannot be
 * reached.
 *
 * The no-credential case is the load-bearing one here, not a formality.
 * Browser traffic through the shell's nginx, and every other caller on the
 * docker network that has never presented a key, must keep working. The
 * credentialled cases have real callers too: purchases (`inventory.items`),
 * bfm's mobile relay (`inventory.sync`, `inventory.types`, `inventory.codes`,
 * `inventory.media`) and the MCP tools, which must be granted `inventory`
 * before this gate ships — see the README's "Who may call it" section and
 * POPS-1878.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import {
  inventoryScopeMap,
  REQUIRE_CREDENTIAL_ENV,
  resolveRequireCredential,
} from '../middleware/service-account-scope.js';
import { resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const { requestOn } = createTestTransport();

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;

const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

const newItem = { itemName: 'MacBook Pro' };

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

const grantedScopes = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_mcp', name: 'pops_api_key', scopes },
});

function app(verify: ServiceAccountVerifier): Express {
  return createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    serviceAccountVerifier: verify,
  });
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-scope-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  resetPillarRegistryCache();
});

describe('the inventory scope map', () => {
  it('covers the whole contract, so no route is gated by an empty table', () => {
    expect(inventoryScopeMap.routes.length).toBeGreaterThan(10);
    expect(inventoryScopeMap.routes.every((route) => route.scope.startsWith('inventory.'))).toBe(
      true
    );
  });

  it('reaches both the items and the locations halves of the surface', () => {
    const scopes = inventoryScopeMap.routes.map((route) => route.scope);

    expect(scopes).toContain('inventory.items.list');
    expect(scopes).toContain('inventory.items.create');
    expect(scopes).toContain('inventory.locations.list');
    expect(scopes).toContain('inventory.locations.create');
  });
});

describe('a request with no credential', () => {
  it('reads without one — browser traffic through the shell presents none', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get('/items');

    expect(response.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });

  it('writes without one — an uncredentialled docker-network caller keeps working', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).post('/items').send(newItem);

    expect(response.status).toBe(201);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('a live credential whose grant does not cover the operation', () => {
  it('403s an items-only account reaching the locations surface', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['inventory.items']))))
      .post('/locations')
      .set('x-api-key', KEY)
      .send({ name: 'Garage' });

    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ message: expect.stringContaining('not authorised') });
  });

  it('403s an account granted a neighbouring pillar entirely', async () => {
    const response = await requestOn(
      app(verifierReturning(grantedScopes(['finance', 'purchases'])))
    )
      .get('/items')
      .set('x-api-key', KEY);

    expect(response.status).toBe(403);
  });

  it('names the account and the missing scope so the grant can be widened', async () => {
    const warn = vi.spyOn(console, 'warn');
    await requestOn(app(verifierReturning(grantedScopes(['inventory.items']))))
      .post('/locations')
      .set('x-api-key', KEY)
      .send({ name: 'Garage' });

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('pops_api_key');
    expect(logged).toContain('inventory.locations.create');
    expect(logged).not.toContain(KEY);
  });
});

describe('a live credential whose grant covers the operation', () => {
  it('admits an items-scoped account to the items surface', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['inventory.items']))))
      .get('/items')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('matches by dot prefix, not by exact procedure', async () => {
    const response = await requestOn(app(verifierReturning(grantedScopes(['inventory']))))
      .post('/locations')
      .set('x-api-key', KEY)
      .send({ name: 'Garage' });

    expect(response.status).toBe(201);
  });
});

describe('failing closed', () => {
  it('401s a key the registry does not recognise, rather than falling back to network trust', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/items')
      .set('x-api-key', KEY);

    expect(response.status).toBe(401);
  });

  it('401s an unknown key on a write, so the gate is not read-only', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .post('/items')
      .set('x-api-key', KEY)
      .send(newItem);

    expect(response.status).toBe(401);
  });

  it('503s rather than admitting a caller it could not verify', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED' }))
    )
      .get('/items')
      .set('x-api-key', KEY);

    expect(response.status).toBe(503);
  });

  it('leaks neither the key nor the registry detail to the caller', async () => {
    const response = await requestOn(
      app(verifierReturning({ outcome: 'unavailable', detail: 'ECONNREFUSED registry-api:3001' }))
    )
      .get('/items')
      .set('x-api-key', KEY);

    expect(response.text).not.toContain(KEY);
    expect(response.text).not.toContain('ECONNREFUSED');
  });
});

describe('resolveRequireCredential', () => {
  it('stays closed on every value that is not the exact string "true"', () => {
    expect(resolveRequireCredential({})).toBe(false);
    expect(resolveRequireCredential({ [REQUIRE_CREDENTIAL_ENV]: 'false' })).toBe(false);
    expect(resolveRequireCredential({ [REQUIRE_CREDENTIAL_ENV]: '1' })).toBe(false);
    expect(resolveRequireCredential({ [REQUIRE_CREDENTIAL_ENV]: 'TRUE' })).toBe(false);
  });

  it(`opts in only on the exact string "true" — a live-seam suite's own opt-in, never production`, () => {
    expect(resolveRequireCredential({ [REQUIRE_CREDENTIAL_ENV]: 'true' })).toBe(true);
  });

  it('stays closed in production even if the flag is left set to "true"', () => {
    expect(
      resolveRequireCredential({ [REQUIRE_CREDENTIAL_ENV]: 'true', NODE_ENV: 'production' })
    ).toBe(false);
  });
});

describe('paths outside the contract', () => {
  it('does not gate the health probe, even with a rejected key', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/health')
      .set('x-api-key', KEY);

    expect(response.status).toBe(200);
  });

  it('does not gate the pillar listing', async () => {
    const response = await requestOn(app(verifierReturning({ outcome: 'rejected' })))
      .get('/pillars')
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
