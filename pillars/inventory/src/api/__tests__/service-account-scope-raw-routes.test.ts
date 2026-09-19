/**
 * The gate over inventory's raw byte routes, driven through the real Express
 * app.
 *
 * Those routes sit outside `inventoryContract`, so the contract projection
 * alone would resolve them to no scope and admit any key, including one the
 * registry revoked. They are declared to the gate instead, and these cases
 * prove each declaration binds: the scope bfm is granted for media
 * (`inventory.media`), the pillar-wide grant, a neighbouring grant that must
 * be refused, and the uncredentialled browser path that must keep working.
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { openInventoryDb, type OpenedInventoryDb } from '../../db/index.js';
import { createInventoryApiApp } from '../app.js';
import { inventoryRawScopeMap, inventoryScopeMap } from '../middleware/service-account-scope.js';
import { resetPillarRegistryCache } from '../pillars/registry.js';
import { createTestTransport } from './test-http.js';

import type { Express } from 'express';

import type { ServiceAccountVerification, ServiceAccountVerifier } from '@pops/pillar-sdk/server';

const { requestOn } = createTestTransport();

const KEY = 'pops_sa_abcdefgh.a-secret-that-never-leaves-this-file';

let tmpDir: string;
let inventoryDb: OpenedInventoryDb;
let previousImagesDir: string | undefined;

function verifierReturning(verification: ServiceAccountVerification): ServiceAccountVerifier {
  return () => Promise.resolve(verification);
}

const grantedScopes = (scopes: readonly string[]): ServiceAccountVerification => ({
  outcome: 'authenticated',
  principal: { id: 'sa_bfm', name: 'bfm', scopes },
});

function app(verify: ServiceAccountVerifier): Express {
  return createInventoryApiApp({
    inventoryDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3002',
    serviceAccountVerifier: verify,
  });
}

function appGranting(scopes: readonly string[]): Express {
  return app(verifierReturning(grantedScopes(scopes)));
}

async function jpeg(): Promise<{ bytes: Buffer; sha256: string }> {
  const bytes = await sharp({
    create: { width: 8, height: 6, channels: 3, background: 'red' },
  })
    .jpeg()
    .toBuffer();
  return { bytes, sha256: createHash('sha256').update(bytes).digest('hex') };
}

function upload(target: Express, path: string, bytes: Buffer, key?: string) {
  const req = requestOn(target).put(path).set('Content-Type', 'image/jpeg');
  return (key === undefined ? req : req.set('x-api-key', key)).send(bytes);
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'inventory-api-raw-scope-test-'));
  inventoryDb = openInventoryDb(join(tmpDir, 'inventory.db'));
  previousImagesDir = process.env['INVENTORY_IMAGES_DIR'];
  process.env['INVENTORY_IMAGES_DIR'] = join(tmpDir, 'images');
  resetPillarRegistryCache();
  delete process.env['POPS_PILLARS'];
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (previousImagesDir === undefined) delete process.env['INVENTORY_IMAGES_DIR'];
  else process.env['INVENTORY_IMAGES_DIR'] = previousImagesDir;
  inventoryDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  resetPillarRegistryCache();
});

describe('the raw route scope map', () => {
  it('declares every raw byte route the app mounts, each under the inventory root', () => {
    expect(inventoryRawScopeMap.routes.map((route) => `${route.method} ${route.scope}`)).toEqual([
      'PUT inventory.media.upload',
      'GET inventory.media.read',
      'GET inventory.photos.file',
      'GET inventory.documentFiles.file',
      'GET inventory.documents.thumbnail',
    ]);
  });

  it('stays apart from the contract map, which still covers the whole contract', () => {
    const contractScopes = new Set(inventoryScopeMap.routes.map((route) => route.scope));

    expect(inventoryScopeMap.routes.length).toBeGreaterThan(10);
    expect(inventoryRawScopeMap.routes.some((route) => contractScopes.has(route.scope))).toBe(
      false
    );
  });
});

describe('media under a grant that covers it', () => {
  it.each([['inventory.media'], ['inventory']])(
    'uploads and reads back under %s',
    async (scope) => {
      const target = appGranting([scope]);
      const { bytes, sha256 } = await jpeg();

      const put = await upload(target, `/media/${sha256}`, bytes, KEY);
      const get = await requestOn(target).get(`/media/${sha256}`).set('x-api-key', KEY);

      expect(put.status).toBe(201);
      expect(get.status).toBe(200);
      expect(Buffer.compare(get.body as Buffer, bytes)).toBe(0);
    }
  );
});

describe('media under a grant that does not cover it', () => {
  it('403s an upload from an items-only key and stores nothing', async () => {
    const target = appGranting(['inventory.items']);
    const { bytes, sha256 } = await jpeg();

    const put = await upload(target, `/media/${sha256}`, bytes, KEY);
    const probe = await requestOn(target).get(`/media/${sha256}`);

    expect(put.status).toBe(403);
    expect(probe.status).toBe(404);
  });

  it('403s a read from an items-only key, although the blob exists', async () => {
    const { bytes, sha256 } = await jpeg();
    await upload(appGranting(['inventory.media']), `/media/${sha256}`, bytes, KEY);

    const get = await requestOn(appGranting(['inventory.items']))
      .get(`/media/${sha256}`)
      .set('x-api-key', KEY);

    expect(get.status).toBe(403);
  });

  it('names the account and the media scope it lacks', async () => {
    const warn = vi.spyOn(console, 'warn');
    const { bytes, sha256 } = await jpeg();
    await upload(appGranting(['inventory.items']), `/media/${sha256}`, bytes, KEY);

    const logged = warn.mock.calls.flat().join(' ');
    expect(logged).toContain('bfm');
    expect(logged).toContain('inventory.media.upload');
    expect(logged).not.toContain(KEY);
  });

  it('401s a key the registry rejects rather than treating the route as unscoped', async () => {
    const { bytes, sha256 } = await jpeg();
    const target = app(verifierReturning({ outcome: 'rejected' }));

    const put = await upload(target, `/media/${sha256}`, bytes, KEY);

    expect(put.status).toBe(401);
  });
});

describe('media with no credential', () => {
  it('is admitted without consulting the registry, exactly as a contract route is', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const target = app(verify);
    const { bytes, sha256 } = await jpeg();

    const put = await upload(target, `/media/${sha256}`, bytes);
    const get = await requestOn(target).get(`/media/${sha256}`);

    expect(put.status).toBe(201);
    expect(get.status).toBe(200);
    expect(verify).not.toHaveBeenCalled();
  });
});

describe('the item file routes', () => {
  const PHOTO = '/api/inventory/photos/items/inv-001/photo_001.jpg';
  const DOCUMENT = '/api/inventory/documents/items/inv-001/file_001.pdf';
  const THUMBNAIL = '/inventory/documents/42/thumbnail';

  it.each([PHOTO, DOCUMENT, THUMBNAIL])('403s %s for an items-only key', async (path) => {
    const response = await requestOn(appGranting(['inventory.items']))
      .get(path)
      .set('x-api-key', KEY);

    expect(response.status).toBe(403);
  });

  it.each([
    [PHOTO, 'inventory.photos'],
    [DOCUMENT, 'inventory.documentFiles'],
  ])('lets %s through to its handler under %s', async (path, scope) => {
    const response = await requestOn(appGranting([scope]))
      .get(path)
      .set('x-api-key', KEY);

    expect(response.status).toBe(404);
  });

  it('lets a photo through with no key, which is how the browser fetches it', async () => {
    const verify = vi.fn(verifierReturning({ outcome: 'rejected' }));
    const response = await requestOn(app(verify)).get(PHOTO);

    expect(response.status).toBe(404);
    expect(verify).not.toHaveBeenCalled();
  });
});
