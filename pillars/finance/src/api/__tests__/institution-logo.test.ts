/**
 * Integration tests for institution logo upload/serve/remove (POPS-2804):
 * the base64 upload round-trip, the binary GET's cache headers, the
 * size-cap and content-type-allowlist rejection paths (including SVG,
 * refused outright — see `src/api/modules/logo-upload.ts`), and removal
 * falling back to no logo.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb } from '../../db/index.js';
import { createFinanceApiApp } from '../app.js';
import { LOGO_MAX_BYTES } from '../modules/logo-upload.js';
import { makeContactsFake } from './contacts-fake.js';
import { makeClient, requestOn } from './test-utils.js';

// A real, minimal 1x1 transparent PNG.
const ONE_PIXEL_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=';

let tmpDir: string;
let financeDb: OpenedFinanceDb;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'finance-api-institution-logo-test-'));
  financeDb = openFinanceDb(join(tmpDir, 'finance.db'));
});

afterEach(() => {
  financeDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

function app() {
  return createFinanceApiApp({
    financeDb,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3004',
    contacts: makeContactsFake(),
  });
}

function client() {
  return makeClient(app());
}

async function createInstitution() {
  return client().institutions.create({ name: 'Westpac', colour: '#d5001c' });
}

describe('institution logo — upload + serve', () => {
  it('uploads a logo and points logoAssetId at it', async () => {
    const institution = await createInstitution();
    const uploaded = await client().institutions.uploadLogo(institution.data.id, {
      contentType: 'image/png',
      contentBase64: ONE_PIXEL_PNG_BASE64,
    });

    expect(uploaded.message).toBe('Logo uploaded');
    expect(uploaded.data.logoAssetId).toEqual(expect.any(String));

    const { data } = await client().institutions.list();
    const refetched = data.find((i) => i.id === institution.data.id);
    expect(refetched?.logoAssetId).toBe(uploaded.data.logoAssetId);
  });

  it('serves the uploaded bytes with an immutable, cacheable header set', async () => {
    const institution = await createInstitution();
    const uploaded = await client().institutions.uploadLogo(institution.data.id, {
      contentType: 'image/png',
      contentBase64: ONE_PIXEL_PNG_BASE64,
    });

    const res = await requestOn(app(), (r) => r.get(`/logos/${uploaded.data.logoAssetId}`));
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('image/png');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers['etag']).toBe(`"${uploaded.data.logoAssetId}"`);
    expect(Buffer.from(res.body).equals(Buffer.from(ONE_PIXEL_PNG_BASE64, 'base64'))).toBe(true);
  });

  it('304s a matching If-None-Match', async () => {
    const institution = await createInstitution();
    const uploaded = await client().institutions.uploadLogo(institution.data.id, {
      contentType: 'image/png',
      contentBase64: ONE_PIXEL_PNG_BASE64,
    });

    const res = await requestOn(app(), (r) =>
      r
        .get(`/logos/${uploaded.data.logoAssetId}`)
        .set('If-None-Match', `"${uploaded.data.logoAssetId}"`)
    );
    expect(res.status).toBe(304);
  });

  it('404s a logo id that was never uploaded', async () => {
    const res = await requestOn(app(), (r) => r.get('/logos/does-not-exist'));
    expect(res.status).toBe(404);
  });

  it('replacing a logo deletes the old blob — the old id 404s afterwards', async () => {
    const institution = await createInstitution();
    const first = await client().institutions.uploadLogo(institution.data.id, {
      contentType: 'image/png',
      contentBase64: ONE_PIXEL_PNG_BASE64,
    });
    const second = await client().institutions.uploadLogo(institution.data.id, {
      contentType: 'image/jpeg',
      contentBase64: ONE_PIXEL_PNG_BASE64,
    });

    expect(second.data.logoAssetId).not.toBe(first.data.logoAssetId);
    const staleRes = await requestOn(app(), (r) => r.get(`/logos/${first.data.logoAssetId}`));
    expect(staleRes.status).toBe(404);
  });

  it('removing a logo clears logoAssetId and the old blob 404s', async () => {
    const institution = await createInstitution();
    const uploaded = await client().institutions.uploadLogo(institution.data.id, {
      contentType: 'image/png',
      contentBase64: ONE_PIXEL_PNG_BASE64,
    });

    const removed = await client().institutions.removeLogo(institution.data.id);
    expect(removed.message).toBe('Logo removed');
    expect(removed.data.logoAssetId).toBeNull();

    const staleRes = await requestOn(app(), (r) => r.get(`/logos/${uploaded.data.logoAssetId}`));
    expect(staleRes.status).toBe(404);
  });
});

describe('institution logo — rejection paths', () => {
  it('rejects SVG outright rather than sanitising it', async () => {
    const institution = await createInstitution();
    await expect(
      client().institutions.uploadLogo(institution.data.id, {
        contentType: 'image/svg+xml',
        contentBase64: Buffer.from('<svg onload="alert(1)"></svg>').toString('base64'),
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an unrecognised content type', async () => {
    const institution = await createInstitution();
    await expect(
      client().institutions.uploadLogo(institution.data.id, {
        contentType: 'application/pdf',
        contentBase64: ONE_PIXEL_PNG_BASE64,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('rejects an upload over the size cap', async () => {
    const institution = await createInstitution();
    const oversized = Buffer.alloc(LOGO_MAX_BYTES + 1, 1).toString('base64');
    await expect(
      client().institutions.uploadLogo(institution.data.id, {
        contentType: 'image/png',
        contentBase64: oversized,
      })
    ).rejects.toMatchObject({ status: 400 });
  });

  it('404s uploading a logo for an institution that does not exist', async () => {
    await expect(
      client().institutions.uploadLogo('missing-id', {
        contentType: 'image/png',
        contentBase64: ONE_PIXEL_PNG_BASE64,
      })
    ).rejects.toMatchObject({ status: 404 });
  });
});
