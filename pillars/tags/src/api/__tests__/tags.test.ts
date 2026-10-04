import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';

import { openTagsDb, type OpenedTagsDb } from '../../db/index.js';
import { createTagsApiApp } from '../app.js';

import type { Express } from 'express';

import type { Tag } from '../../contract/rest-tags-schemas.js';

let directory: string | undefined;
let opened: OpenedTagsDb | undefined;

afterEach(() => {
  opened?.raw.close();
  opened = undefined;
  if (directory !== undefined) rmSync(directory, { recursive: true, force: true });
  directory = undefined;
});

function appFor(): Express {
  directory = mkdtempSync(join(tmpdir(), 'tags-routes-test-'));
  opened = openTagsDb(join(directory, 'tags.db'));
  return createTagsApiApp({
    tagsDb: opened,
    version: '0.0.1-test',
    selfBaseUrl: 'http://localhost:3017',
    serviceAccountVerifier: async () => ({
      outcome: 'authenticated',
      principal: { id: 'sa_test', name: 'test', scopes: ['tags.tags'] },
    }),
  });
}

async function createTag(
  app: Express,
  name: string,
  extras: { readonly parentId?: string; readonly description?: string } = {}
): Promise<Tag> {
  const response = await request(app)
    .post('/tags')
    .set('x-api-key', 'test-key')
    .send({ facet: 'trip', name, ...extras })
    .expect(201);
  return response.body as Tag;
}

function api(app: Express) {
  return {
    get: (path: string) => request(app).get(path).set('x-api-key', 'test-key'),
    post: (path: string) => request(app).post(path).set('x-api-key', 'test-key'),
    patch: (path: string) => request(app).patch(path).set('x-api-key', 'test-key'),
  };
}

function expectErrorEnvelope(response: {
  readonly body: Record<string, unknown>;
  readonly headers: { readonly [name: string]: unknown };
}) {
  expect(response.body).toMatchObject({
    code: expect.any(String),
    message: expect.any(String),
    requestId: expect.any(String),
    retryable: expect.any(Boolean),
  });
  expect(response.headers['x-request-id']).toBe(response.body.requestId);
}

describe('tags vocabulary HTTP routes', () => {
  it('creates idempotently, then lists and reads the same tag', async () => {
    const app = appFor();
    const first = await api(app)
      .post('/tags')
      .send({
        facet: 'trip',
        name: 'Brazil',
        window: { start: '2026-11-01', end: null, region: 'BR' },
      })
      .expect(201);
    const duplicate = await api(app)
      .post('/tags')
      .send({ facet: 'trip', name: 'bRAZIL' })
      .expect(200);

    expect(first.body).toMatchObject({
      id: expect.any(String),
      facet: 'trip',
      name: 'Brazil',
      window: { start: '2026-11-01', end: null, region: 'BR' },
      archived: false,
      mergedIntoId: null,
    });
    expect(duplicate.body.id).toBe(first.body.id);
    expect(duplicate.body.name).toBe('Brazil');

    const listed = await api(app).get('/tags?facet=trip').expect(200);
    expect(listed.body.tags).toHaveLength(1);
    expect(listed.body.tags[0].id).toBe(first.body.id);

    const read = await api(app).get(`/tags/${first.body.id}`).expect(200);
    expect(read.body).toEqual(first.body);
  });

  it('filters archived tags and applies the updatedSince query', async () => {
    const app = appFor();
    const active = await createTag(app, 'Active stop');
    const archived = await createTag(app, 'Archived stop');
    await api(app).post(`/tags/${archived.id}/archive`).send({}).expect(200);

    const activeOnly = await api(app).get('/tags?includeArchived=false').expect(200);
    expect(activeOnly.body.tags.map((tag: Tag) => tag.id)).toEqual([active.id]);

    const afterAllTags = await api(app)
      .get('/tags?updatedSince=9999-01-01T00:00:00.000Z')
      .expect(200);
    expect(afterAllTags.body).toEqual({ tags: [] });
  });

  it('updates a tag and reports a case-insensitive name conflict', async () => {
    const app = appFor();
    const parent = await createTag(app, 'Brazil');
    const tag = await createTag(app, 'Rio');

    const updated = await api(app)
      .patch(`/tags/${tag.id}`)
      .send({
        name: 'Rio de Janeiro',
        parentId: parent.id,
        description: 'A city stop',
        window: { start: '2026-11-03', end: '2026-11-05', region: 'BR-RJ' },
      })
      .expect(200);
    expect(updated.body).toMatchObject({
      name: 'Rio de Janeiro',
      parentId: parent.id,
      description: 'A city stop',
      window: { start: '2026-11-03', end: '2026-11-05', region: 'BR-RJ' },
    });

    const conflict = await api(app).patch(`/tags/${tag.id}`).send({ name: 'bRaZiL' }).expect(409);
    expectErrorEnvelope(conflict);
    expect(conflict.body.code).toBe('tags.tag.name_conflict');
  });

  it('archives and restores a tag', async () => {
    const app = appFor();
    const tag = await createTag(app, 'Old stop');

    const archived = await api(app).post(`/tags/${tag.id}/archive`).send({}).expect(200);
    expect(archived.body).toMatchObject({ archived: true, archivedAt: expect.any(String) });

    const unarchived = await api(app).post(`/tags/${tag.id}/unarchive`).send({}).expect(200);
    expect(unarchived.body).toMatchObject({ archived: false, archivedAt: null });
  });

  it('returns a conflict when unarchiving a tag whose active name is taken', async () => {
    const app = appFor();
    const archived = await createTag(app, 'Shared name');
    await api(app).post(`/tags/${archived.id}/archive`).send({}).expect(200);
    await api(app).post('/tags').send({ facet: 'trip', name: 'shared NAME' }).expect(201);

    const conflict = await api(app).post(`/tags/${archived.id}/unarchive`).send({}).expect(409);
    expectErrorEnvelope(conflict);
    expect(conflict.body.code).toBe('tags.tag.name_conflict');
  });

  it('merges a tag and expands a parent to its children and merged identity', async () => {
    const app = appFor();
    const parent = await createTag(app, 'Japan');
    const child = await createTag(app, 'Kyoto', { parentId: parent.id });
    const legacy = await createTag(app, 'Old Japan');

    const merged = await api(app)
      .post(`/tags/${legacy.id}/merge`)
      .send({ intoId: parent.id })
      .expect(200);
    expect(merged.body).toMatchObject({
      id: legacy.id,
      archived: true,
      mergedIntoId: parent.id,
    });

    const unknownId = '00000000-0000-4000-8000-000000000001';
    const expanded = await api(app)
      .post('/tags/expand')
      .send({ ids: [parent.id, unknownId] })
      .expect(200);
    expect(expanded.body.ids).toEqual([child.id, legacy.id, parent.id].toSorted());
    expect(expanded.body.unknownIds).toEqual([unknownId]);
  });

  it('returns 404 envelopes for unknown ids on get, update, archive, and merge', async () => {
    const app = appFor();
    const target = await createTag(app, 'Target');
    const source = await createTag(app, 'Source');
    const unknownId = '00000000-0000-4000-8000-000000000002';
    const unknownTargetId = '00000000-0000-4000-8000-000000000003';
    const responses = [
      await api(app).get(`/tags/${unknownId}`).expect(404),
      await api(app).patch(`/tags/${unknownId}`).send({ name: 'Unknown' }).expect(404),
      await api(app).post(`/tags/${unknownId}/archive`).send({}).expect(404),
      await api(app).post(`/tags/${unknownId}/merge`).send({ intoId: target.id }).expect(404),
      await api(app).post(`/tags/${source.id}/merge`).send({ intoId: unknownTargetId }).expect(404),
    ];

    for (const response of responses) {
      expectErrorEnvelope(response);
      expect(response.body.code).toBe('tags.tag.not_found');
    }
  });

  it('maps invalid parents and merges to 422 domain-error envelopes', async () => {
    const app = appFor();
    const missingParentId = '00000000-0000-4000-8000-000000000004';
    const invalidParent = await api(app)
      .post('/tags')
      .send({ facet: 'trip', name: 'Orphan', parentId: missingParentId })
      .expect(422);
    expectErrorEnvelope(invalidParent);
    expect(invalidParent.body.code).toBe('tags.tag.parent_invalid');

    const source = await createTag(app, 'Trip source');
    const target = await api(app)
      .post('/tags')
      .send({ facet: 'hobby', name: 'Hobby target' })
      .expect(201);
    const invalidMerge = await api(app)
      .post(`/tags/${source.id}/merge`)
      .send({ intoId: target.body.id })
      .expect(422);
    expectErrorEnvelope(invalidMerge);
    expect(invalidMerge.body.code).toBe('tags.tag.merge_invalid');
  });

  it('returns 400 ADR-054 envelopes for an unknown facet and malformed body', async () => {
    const app = appFor();
    const unknownFacet = await api(app).get('/tags?facet=meal').expect(400);
    const malformedBody = await api(app).post('/tags').send({ facet: 'trip' }).expect(400);
    const invalidWindow = await api(app)
      .post('/tags')
      .send({
        facet: 'trip',
        name: 'Invalid window',
        window: { start: null, end: null, region: 'BR' },
      })
      .expect(400);

    for (const response of [unknownFacet, malformedBody, invalidWindow]) {
      expectErrorEnvelope(response);
      expect(response.body.code).toBe('tags.request.invalid');
      expect(response.body.retryable).toBe(false);
    }
  });
});
