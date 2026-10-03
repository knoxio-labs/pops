import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { openTagsDb, type OpenedTagsDb } from '../../db/index.js';
import { tags } from '../../db/schema/tags.js';
import { createTagsApiApp } from '../app.js';

import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

let directory: string | undefined;
let opened: OpenedTagsDb | undefined;

afterEach(() => {
  opened?.raw.close();
  opened = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function appFor(verifier: ServiceAccountVerifier) {
  directory = mkdtempSync(join(tmpdir(), 'tags-api-test-'));
  opened = openTagsDb(join(directory, 'tags.db'));
  return createTagsApiApp({
    tagsDb: opened,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3017',
    serviceAccountVerifier: verifier,
  });
}

const authenticated: ServiceAccountVerifier = async () => ({
  outcome: 'authenticated',
  principal: { id: 'sa_test', name: 'test', scopes: ['tags.tags'] },
});

describe('tags HTTP app', () => {
  it('keeps health, roster, and OpenAPI discovery open', async () => {
    const app = appFor(async () => ({ outcome: 'rejected' }));

    await request(app).get('/health').expect(200);
    await request(app)
      .get('/pillars')
      .expect(200, {
        pillars: [{ id: 'tags', baseUrl: 'http://localhost:3017' }],
      });
    const openapi = await request(app).get('/openapi').expect(200);
    expect(openapi.body.paths['/tags'].get.operationId).toBe('tags.list');
  });

  it('requires the tags vocabulary service-account scope', async () => {
    const app = appFor(async () => ({
      outcome: 'authenticated',
      principal: { id: 'sa_test', name: 'test', scopes: [] },
    }));

    await request(app).get('/tags').set('x-api-key', 'test-key').expect(403);
  });

  it('returns an empty list on a fresh database for a scoped key', async () => {
    const app = appFor(authenticated);

    await request(app).get('/tags').set('x-api-key', 'test-key').expect(200, { tags: [] });
  });

  it('returns every row, including archived tags', async () => {
    const app = appFor(authenticated);
    const timestamp = '2026-10-03T00:00:00.000Z';
    opened?.db.insert(tags).values({ facet: 'trip', name: 'Japan', archivedAt: timestamp }).run();

    const response = await request(app).get('/tags').set('x-api-key', 'test-key').expect(200);

    expect(response.body.tags).toHaveLength(1);
    expect(response.body.tags[0]).toMatchObject({
      facet: 'trip',
      name: 'Japan',
      archivedAt: timestamp,
    });
  });

  it('returns 404 for an unknown route', async () => {
    const app = appFor(authenticated);

    await request(app).get('/not-a-route').expect(404);
  });
});
