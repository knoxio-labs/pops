import { describe, expect, it } from 'vitest';

import {
  CreateTagBody,
  ExpandTagsBody,
  TagSchema,
  UpdateTagBody,
} from '../rest-tags-schemas.js';

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
    expect(ExpandTagsBody.safeParse({ ids: Array.from({ length: 501 }, () => tagId) }).success).toBe(
      false
    );
  });

  it('round-trips a complete tag with its date window', () => {
    expect(TagSchema.parse(validTag)).toEqual(validTag);
  });
});
