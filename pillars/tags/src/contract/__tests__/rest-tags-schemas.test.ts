import { describe, expect, it } from 'vitest';

import { PopsError } from '@pops/pillar-express';

import { tagsErrors } from '../../api/errors.js';
import { SHARED_TAG_FACETS } from '../facets.js';
import {
  CreateTagBody,
  ExpandTagsBody,
  ListTagsQuery,
  TagSchema,
  UpdateTagBody,
} from '../rest-tags-schemas.js';
import { tagsVocabularyContract } from '../rest-tags.js';

const validTag = {
  id: '88bdb9c0-507e-4f36-a2bc-bbd28b129c06',
  facet: 'trip',
  name: 'Brazil 2026',
  parentId: null,
  description: 'The November trip',
  window: { start: '2026-11-01', end: '2026-11-30', region: 'Brazil' },
  archived: false,
  archivedAt: null,
  mergedIntoId: null,
  createdAt: '2026-10-01T12:30:00.000Z',
  updatedAt: '2026-10-02T14:45:00.000Z',
} as const;

const tagId = '88bdb9c0-507e-4f36-a2bc-bbd28b129c06';

describe('shared tag contract schemas', () => {
  it('rejects an empty or whitespace-only tag name on create and update', () => {
    expect(CreateTagBody.safeParse({ facet: 'trip', name: '' }).success).toBe(false);
    expect(UpdateTagBody.safeParse({ name: '   ' }).success).toBe(false);
  });

  it('accepts the shared facets and rejects unknown facet values', () => {
    for (const facet of SHARED_TAG_FACETS) {
      expect(CreateTagBody.safeParse({ facet, name: 'Shared tag' }).success).toBe(true);
      expect(ListTagsQuery.safeParse({ facet }).success).toBe(true);
    }

    expect(CreateTagBody.safeParse({ facet: 'unknown', name: 'Shared tag' }).success).toBe(false);
    expect(TagSchema.safeParse({ ...validTag, facet: 'unknown' }).success).toBe(false);
  });

  it('rejects malformed and impossible calendar dates', () => {
    expect(
      TagSchema.safeParse({ ...validTag, window: { ...validTag.window, start: '2026-02-30' } })
        .success
    ).toBe(false);
    expect(
      TagSchema.safeParse({ ...validTag, window: { ...validTag.window, end: '11/30/2026' } })
        .success
    ).toBe(false);
  });

  it('rejects a window whose end is before its start', () => {
    expect(
      TagSchema.safeParse({
        ...validTag,
        window: { start: '2026-11-30', end: '2026-11-01', region: null },
      }).success
    ).toBe(false);
  });

  it('rejects a region without a window start date', () => {
    expect(
      TagSchema.safeParse({
        ...validTag,
        window: { start: null, end: null, region: 'Brazil' },
      }).success
    ).toBe(false);
  });

  it('requires between one and 500 ids when expanding tags', () => {
    expect(ExpandTagsBody.safeParse({ ids: [] }).success).toBe(false);
    expect(
      ExpandTagsBody.safeParse({ ids: Array.from({ length: 501 }, () => tagId) }).success
    ).toBe(false);
  });

  it('round-trips a complete tag with its date window', () => {
    expect(TagSchema.parse(validTag)).toEqual(validTag);
  });

  it('defines the eight unmounted vocabulary routes with summaries', () => {
    const routes = Object.values(tagsVocabularyContract) as Array<{
      method: string;
      path: string;
      summary?: string;
    }>;

    expect(routes.map(({ method, path }) => `${method} ${path}`)).toEqual([
      'GET /tags',
      'GET /tags/:id',
      'POST /tags',
      'PATCH /tags/:id',
      'POST /tags/:id/archive',
      'POST /tags/:id/unarchive',
      'POST /tags/:id/merge',
      'POST /tags/expand',
    ]);
    expect(
      routes.every(({ summary }) => typeof summary === 'string' && summary.trim().length > 0)
    ).toBe(true);
  });

  it('registers the six vocabulary error codes with their HTTP statuses', () => {
    const cases = [
      [tagsErrors.not_found, 'tags.tag.not_found', 404],
      [tagsErrors.name_conflict, 'tags.tag.name_conflict', 409],
      [tagsErrors.unknown_facet, 'tags.tag.unknown_facet', 422],
      [tagsErrors.parent_invalid, 'tags.tag.parent_invalid', 422],
      [tagsErrors.merge_invalid, 'tags.tag.merge_invalid', 422],
      [tagsErrors.window_invalid, 'tags.tag.window_invalid', 422],
    ] as const;

    const observed = cases.map(([raise]) => {
      try {
        raise();
      } catch (error) {
        if (error instanceof PopsError) return { code: error.code, status: error.status };
        throw error;
      }

      throw new Error('Expected the registered error helper to throw');
    });

    expect(observed).toEqual(cases.map(([, code, status]) => ({ code, status })));
  });
});
