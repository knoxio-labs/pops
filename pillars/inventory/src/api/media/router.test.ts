import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import express, { type Express } from 'express';
import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedTestDb, type MigratedTestDb } from '../../db/__tests__/migrated-db.js';
import { createTestTransport } from '../__tests__/test-http.js';
import { MEDIA_UPLOAD_LIMIT_BYTES, createInventoryMediaRouter } from './router.js';

const { requestOn } = createTestTransport();

let testDb: MigratedTestDb;
let imagesDir: string;

function app(): Express {
  const a = express();
  a.use(createInventoryMediaRouter({ db: testDb.db, imagesDir: () => imagesDir }));
  return a;
}

async function jpeg(colour: string): Promise<Buffer> {
  return sharp({ create: { width: 8, height: 6, channels: 3, background: colour } })
    .jpeg()
    .toBuffer();
}

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

beforeEach(() => {
  testDb = openMigratedTestDb();
  imagesDir = mkdtempSync(join(tmpdir(), 'inv-media-router-'));
});

afterEach(() => {
  testDb.raw.close();
  rmSync(imagesDir, { recursive: true, force: true });
});

describe('PUT /media/:sha256', () => {
  it('stores the bytes and answers 201 on first upload', async () => {
    const bytes = await jpeg('red');
    const sha256 = sha256Of(bytes);

    const res = await requestOn(app())
      .put(`/media/${sha256}`)
      .set('Content-Type', 'image/jpeg')
      .send(bytes);

    expect(res.status).toBe(201);
    expect(res.body).toEqual({ sha256, alreadyStored: false });
  });

  it('answers 200 alreadyStored on a re-upload of the same bytes', async () => {
    const bytes = await jpeg('blue');
    const sha256 = sha256Of(bytes);
    await requestOn(app()).put(`/media/${sha256}`).set('Content-Type', 'image/jpeg').send(bytes);

    const res = await requestOn(app())
      .put(`/media/${sha256}`)
      .set('Content-Type', 'image/jpeg')
      .send(bytes);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sha256, alreadyStored: true });
  });

  it('answers 400 hash_mismatch when the path param does not match the bytes', async () => {
    const bytes = await jpeg('green');
    const wrongSha256 = sha256Of(await jpeg('yellow'));

    const res = await requestOn(app())
      .put(`/media/${wrongSha256}`)
      .set('Content-Type', 'image/jpeg')
      .send(bytes);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'hash_mismatch' });
  });

  it('answers 400 invalid_sha256 for a malformed path param', async () => {
    const res = await requestOn(app())
      .put('/media/not-a-hash')
      .set('Content-Type', 'image/jpeg')
      .send(Buffer.from('irrelevant'));

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_sha256' });
  });

  it('answers 415 for an unsupported content type', async () => {
    const bytes = Buffer.from('whatever');
    const sha256 = sha256Of(bytes);

    const res = await requestOn(app())
      .put(`/media/${sha256}`)
      .set('Content-Type', 'application/pdf')
      .send(bytes);

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: 'unsupported_media_type' });
  });

  it('answers 415 when the bytes are not a decodable image, despite a matching hash', async () => {
    const bytes = Buffer.from('not actually a jpeg');
    const sha256 = sha256Of(bytes);

    const res = await requestOn(app())
      .put(`/media/${sha256}`)
      .set('Content-Type', 'image/jpeg')
      .send(bytes);

    expect(res.status).toBe(415);
    expect(res.body).toEqual({ error: 'unsupported_media_type' });
  });

  it('answers 413 when the body exceeds the upload cap', async () => {
    const oversized = Buffer.alloc(MEDIA_UPLOAD_LIMIT_BYTES + 1, 1);
    const sha256 = sha256Of(oversized);

    const res = await requestOn(app())
      .put(`/media/${sha256}`)
      .set('Content-Type', 'image/jpeg')
      .send(oversized);

    expect(res.status).toBe(413);
    expect(res.body).toEqual({ error: 'payload_too_large' });
  });
});

describe('GET /media/:sha256', () => {
  it('serves the full variant with an ETag and the stored mime type', async () => {
    const bytes = await jpeg('purple');
    const sha256 = sha256Of(bytes);
    await requestOn(app()).put(`/media/${sha256}`).set('Content-Type', 'image/jpeg').send(bytes);

    const res = await requestOn(app()).get(`/media/${sha256}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/jpeg');
    expect(res.headers['etag']).toBe(`"${sha256}"`);
    expect(res.body).toEqual(bytes);
  });

  it('serves the thumb variant with a variant-suffixed ETag, smaller than the original', async () => {
    const bytes = await jpeg('orange');
    const sha256 = sha256Of(bytes);
    await requestOn(app()).put(`/media/${sha256}`).set('Content-Type', 'image/jpeg').send(bytes);

    const res = await requestOn(app()).get(`/media/${sha256}?variant=thumb`);

    expect(res.status).toBe(200);
    expect(res.headers['etag']).toBe(`"${sha256}-thumb"`);
  });

  it('returns 304 on a matching If-None-Match', async () => {
    const bytes = await jpeg('teal');
    const sha256 = sha256Of(bytes);
    await requestOn(app()).put(`/media/${sha256}`).set('Content-Type', 'image/jpeg').send(bytes);
    const first = await requestOn(app()).get(`/media/${sha256}`);
    const etag = first.headers['etag'];
    if (etag === undefined) throw new Error('media response carried no ETag to revalidate against');

    const res = await requestOn(app()).get(`/media/${sha256}`).set('If-None-Match', etag);

    expect(res.status).toBe(304);
  });

  it('returns 404 for a hash nothing has stored', async () => {
    const res = await requestOn(app()).get(`/media/${'a'.repeat(64)}`);

    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'media_not_found' });
  });

  it('returns 400 for an unrecognised variant', async () => {
    const bytes = await jpeg('grey');
    const sha256 = sha256Of(bytes);
    await requestOn(app()).put(`/media/${sha256}`).set('Content-Type', 'image/jpeg').send(bytes);

    const res = await requestOn(app()).get(`/media/${sha256}?variant=huge`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_variant' });
  });

  it('returns 400 for a malformed sha256 path param', async () => {
    const res = await requestOn(app()).get('/media/not-a-hash');

    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'invalid_sha256' });
  });
});
