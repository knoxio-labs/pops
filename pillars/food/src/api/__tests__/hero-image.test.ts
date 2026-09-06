/**
 * Integration tests for the hero-image surface: ts-rest upload/remove
 * (base64) + the plain Express binary serve route. A real PNG is produced
 * with sharp so the dimension probe + thumbnail pass run. Files land in a
 * per-test FOOD_RECIPES_DIR.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { type OpenedFoodDb, openFoodDb } from '../../db/index.js';
import { createFoodApiApp } from '../app.js';
import { createTestTransport } from './test-http.js';
import { makeClient, type HttpError } from './test-utils.js';

const { requestOn } = createTestTransport();

let tmpDir: string;
let foodDb: OpenedFoodDb;
let recipeId: number;

const SIMPLE_DSL = `@recipe(slug="toast", title="Toast")
@yield(toast, 1:count)
@ingredient(1, bread, 1:count)
@step("Toast @1.")
`;

function app() {
  return createFoodApiApp({ foodDb, version: '0.0.1-test', selfBaseUrl: 'http://localhost:3005' });
}

async function pngBase64(): Promise<string> {
  const buf = await sharp({
    create: { width: 16, height: 12, channels: 3, background: { r: 200, g: 50, b: 50 } },
  })
    .png()
    .toBuffer();
  return buf.toString('base64');
}

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'food-api-hero-test-'));
  process.env['FOOD_RECIPES_DIR'] = join(tmpDir, 'recipes');
  foodDb = openFoodDb(join(tmpDir, 'food.db'));
});

afterEach(() => {
  foodDb.raw.close();
  rmSync(tmpDir, { recursive: true, force: true });
  delete process.env['FOOD_RECIPES_DIR'];
});

describe('hero-image REST', () => {
  it('uploads, serves the binary, then removes', async () => {
    const client = makeClient(app());
    const created = await client.recipes.create(SIMPLE_DSL);
    recipeId = created.recipeId;

    const uploaded = await client.heroImage.upload(recipeId, 'image/png', await pngBase64());
    expect(uploaded.data.heroImagePath).toBe(`${recipeId}/hero.png`);
    expect(uploaded.data.width).toBe(16);
    expect(uploaded.data.height).toBe(12);

    const served = await requestOn(app()).get(`/recipes/${recipeId}/hero.png`);
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');

    const thumb = await requestOn(app()).get(`/recipes/${recipeId}/hero-thumb.webp`);
    expect(thumb.status).toBe(200);

    const removed = await client.heroImage.remove(recipeId);
    expect(removed.ok).toBe(true);

    const gone = await requestOn(app()).get(`/recipes/${recipeId}/hero.png`);
    expect(gone.status).toBe(404);
  });

  it('404s upload for an unknown recipe', async () => {
    await expect(
      makeClient(app()).heroImage.upload(999999, 'image/png', await pngBase64())
    ).rejects.toMatchObject({ status: 404 });
  });

  it('400s upload of undecodable bytes', async () => {
    const client = makeClient(app());
    const created = await client.recipes.create(SIMPLE_DSL);
    await expect(
      client.heroImage.upload(
        created.recipeId,
        'image/png',
        Buffer.from('not an image').toString('base64')
      )
    ).rejects.toMatchObject({ status: 400 });
  });

  // The status alone was true before POPS-3043 too — food's `ValidationError`
  // took `(details: unknown)` and hardcoded `'Validation failed'`, so this
  // module's explanations were discarded before reaching the caller. Assert
  // the body, which is the part that was wrong.
  //
  // Only the decode failure is asserted because it is the only one of the six
  // guards a REST caller can reach: the contract's zod body rejects an empty
  // `contentBase64` and a mime type outside the enum first, so those guards
  // answer nobody. They stay as defence for direct service callers.
  it('says the bytes would not decode, rather than "Validation failed"', async () => {
    const client = makeClient(app());
    const created = await client.recipes.create(SIMPLE_DSL);

    const rejection = await client.heroImage
      .upload(created.recipeId, 'image/png', Buffer.from('not an image').toString('base64'))
      .then(
        () => null,
        (err: unknown) => err as HttpError
      );

    expect(rejection?.status).toBe(400);
    expect(rejection?.body).toMatchObject({ code: 'ValidationError' });
    expect(rejection?.message).toMatch(/^Image could not be decoded \(/);
  });

  it('falls through to the recipes route for a non-hero path', async () => {
    // GET /recipes/:slug/drafts must NOT be shadowed by the serve route.
    const client = makeClient(app());
    await client.recipes.create(SIMPLE_DSL);
    const drafts = await client.recipes.listDrafts('toast');
    expect(Array.isArray(drafts.drafts)).toBe(true);
  });
});
