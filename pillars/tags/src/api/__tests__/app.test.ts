import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { createAccessJwtFixture } from '@pops/pillar-sdk/testing';

import { openTagsDb, type OpenedTagsDb } from '../../db/index.js';
import { tags } from '../../db/schema/tags.js';
import { createTagsApiApp } from '../app.js';

import type { AccessIdentityOptions } from '@pops/pillar-express';
import type { ServiceAccountVerifier } from '@pops/pillar-sdk/server';

let directory: string | undefined;
let opened: OpenedTagsDb | undefined;

afterEach(() => {
  opened?.raw.close();
  opened = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function appFor(verifier: ServiceAccountVerifier, accessIdentity?: AccessIdentityOptions) {
  directory = mkdtempSync(join(tmpdir(), 'tags-api-test-'));
  opened = openTagsDb(join(directory, 'tags.db'));
  return createTagsApiApp({
    tagsDb: opened,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3017',
    serviceAccountVerifier: verifier,
    accessIdentity,
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

  it('allows verified operators to list tags without opening other scoped routes', async () => {
    const audience = 'tags-api-test';
    const operator = 'owner@pops.test';
    const access = createAccessJwtFixture({ audience });
    const app = appFor(
      async (key) => {
        if (key === 'valid') {
          return {
            outcome: 'authenticated',
            principal: { id: 'sa_test', name: 'test', scopes: ['tags.tags'] },
          };
        }
        if (key === 'insufficient') {
          return {
            outcome: 'authenticated',
            principal: { id: 'sa_test', name: 'test', scopes: [] },
          };
        }
        if (key === 'unavailable') {
          return { outcome: 'unavailable', detail: 'registry unavailable' };
        }
        return { outcome: 'rejected' };
      },
      {
        env: {
          POPS_OPERATOR_EMAILS: operator,
          CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
          CLOUDFLARE_ACCESS_AUD: audience,
        },
        fetchImpl: access.fetchImpl,
      }
    );
    const operatorToken = access.signForEmail(operator);
    const guestToken = access.signForEmail('guest@example.test');

    const operatorList = await request(app)
      .get('/tags')
      .set('cf-access-jwt-assertion', operatorToken)
      .expect(200);
    expect(operatorList.body).toEqual({ tags: [] });
    await request(app)
      .get('/tags/00000000-0000-4000-8000-000000000001')
      .set('cf-access-jwt-assertion', operatorToken)
      .expect(401);
    await request(app)
      .post('/tags')
      .set('cf-access-jwt-assertion', operatorToken)
      .send({ facet: 'trip', name: 'Rejected operator tag' })
      .expect(401);
    await request(app)
      .post('/tags/expand')
      .set('cf-access-jwt-assertion', operatorToken)
      .send({ ids: ['00000000-0000-4000-8000-000000000001'] })
      .expect(401);

    await request(app).get('/tags').expect(401);
    await request(app).get('/tags').set('cf-access-jwt-assertion', 'invalid').expect(401);
    await request(app).get('/tags').set('cf-access-jwt-assertion', guestToken).expect(403);
    await request(app)
      .post('/tags')
      .set('cf-access-jwt-assertion', guestToken)
      .send({ facet: 'trip', name: 'Rejected guest tag' })
      .expect(403);
    await request(app)
      .get('/tags')
      .set('cf-access-jwt-assertion', operatorToken)
      .set('x-api-key', 'revoked')
      .expect(401);
    await request(app)
      .get('/tags')
      .set('cf-access-jwt-assertion', operatorToken)
      .set('x-api-key', 'insufficient')
      .expect(403);
    await request(app).get('/tags').set('x-api-key', 'insufficient').expect(403);
    await request(app).get('/tags').set('x-api-key', 'revoked').expect(401);
    await request(app).get('/tags').set('x-api-key', 'unavailable').expect(503);

    await request(app)
      .get('/tags/00000000-0000-4000-8000-000000000001')
      .set('x-api-key', 'valid')
      .expect(404);
    await request(app)
      .post('/tags')
      .set('x-api-key', 'valid')
      .send({ facet: 'trip', name: 'Machine-created test tag' })
      .expect(201);
    const machineList = await request(app).get('/tags').set('x-api-key', 'valid').expect(200);
    expect(machineList.body.tags).toEqual([
      expect.objectContaining({ name: 'Machine-created test tag' }),
    ]);
  });

  it('does not treat a JWT as verified when Access classification is unconfigured', async () => {
    const audience = 'tags-api-unconfigured-test';
    const access = createAccessJwtFixture({ audience });
    const app = appFor(async () => ({ outcome: 'rejected' }), { env: {} });

    await request(app)
      .get('/tags')
      .set('cf-access-jwt-assertion', access.signForEmail('owner@pops.test'))
      .expect(401);
  });

  it('fails closed when Access signing-key verification is unavailable', async () => {
    const audience = 'tags-api-unavailable-test';
    const access = createAccessJwtFixture({ audience });
    const app = appFor(async () => ({ outcome: 'rejected' }), {
      env: {
        POPS_OPERATOR_EMAILS: 'owner@pops.test',
        CLOUDFLARE_ACCESS_TEAM_NAME: access.teamName,
        CLOUDFLARE_ACCESS_AUD: audience,
      },
      fetchImpl: async () => new Response(null, { status: 503 }),
    });

    await request(app)
      .get('/tags')
      .set('cf-access-jwt-assertion', access.signForEmail('owner@pops.test'))
      .expect(401);
  });

  it('returns archived rows when requested', async () => {
    const app = appFor(authenticated);
    const timestamp = '2026-10-03T00:00:00.000Z';
    opened?.db.insert(tags).values({ facet: 'trip', name: 'Japan', archivedAt: timestamp }).run();

    const response = await request(app)
      .get('/tags?includeArchived=true')
      .set('x-api-key', 'test-key')
      .expect(200);

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
