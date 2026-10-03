import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { TagsServiceError } from '../../errors.js';
import { openTagsDb, type OpenedTagsDb } from '../../index.js';
import { tags } from '../../schema.js';
import {
  archiveTag,
  createOrGetTag,
  expandTagIds,
  getTag,
  listTags,
  mergeTag,
  unarchiveTag,
  updateTag,
} from '../tags.js';

import type { CreateTagInput, TagRecord } from '../tags.js';

let directory: string;
let opened: OpenedTagsDb;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'tags-service-test-'));
  opened = openTagsDb(join(directory, 'tags.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

function createTag(
  name: string,
  extras: Omit<CreateTagInput, 'facet' | 'name'> = {},
  facet = 'trip'
): TagRecord {
  return createOrGetTag(opened.db, { ...extras, facet, name });
}

function expectServiceError(action: () => unknown, code: TagsServiceError['code']): void {
  let caught: unknown;
  try {
    action();
  } catch (error) {
    caught = error;
  }
  expect(caught).toBeInstanceOf(TagsServiceError);
  expect(caught).toMatchObject({ code });
}

function makeRacingReadDb(): typeof opened.db {
  let raceInserted = false;
  const wrapQuery = <T extends object>(query: T): T =>
    new Proxy(query, {
      get(target, property) {
        const member = Reflect.get(target, property, target);
        if (typeof member !== 'function') return member;

        return (...args: unknown[]) => {
          const result = member.apply(target, args);
          if (property === 'get') {
            if (!raceInserted) {
              raceInserted = true;
              opened.db
                .insert(tags)
                .values({
                  facet: 'trip',
                  name: 'Concurrent tag',
                  parentId: null,
                  description: null,
                  windowStart: null,
                  windowEnd: null,
                  windowRegion: null,
                })
                .run();
            }
            return result;
          }
          return result !== null && typeof result === 'object' ? wrapQuery(result) : result;
        };
      },
    });

  return new Proxy(opened.db, {
    get(target, property) {
      const member = Reflect.get(target, property, target);
      if (property === 'select' && typeof member === 'function') {
        return (...args: unknown[]) => wrapQuery(member.apply(target, args) as object);
      }
      return typeof member === 'function' ? member.bind(target) : member;
    },
  }) as typeof opened.db;
}

describe('shared tag creation and listing', () => {
  it('returns the existing id for a case-insensitive duplicate create', () => {
    const first = createTag('Brazil trip', { description: 'Original' });
    const duplicate = createTag('bRAZIL TRIP', { description: 'Ignored duplicate input' });

    expect(duplicate.id).toBe(first.id);
    expect(duplicate.description).toBe('Original');
    expect(listTags(opened.db)).toHaveLength(1);
  });

  it('rejects facets outside the shared vocabulary', () => {
    expectServiceError(() => createTag('Unknown', {}, 'meal'), 'unknown_facet');
  });

  it('returns the concurrently created active tag after an insert race', () => {
    const raced = createOrGetTag(makeRacingReadDb(), {
      facet: 'trip',
      name: 'Concurrent tag',
    });

    expect(raced.name).toBe('Concurrent tag');
    expect(listTags(opened.db)).toHaveLength(1);
  });

  it('lists by facet, archive state, and inclusive updated-since time', () => {
    const trip = createTag('Brazil trip');
    createTag('Cycling', {}, 'hobby');
    const archived = createTag('Old trip');
    archiveTag(opened.db, archived.id);

    expect(listTags(opened.db, { facet: 'trip' }).map((tag) => tag.id)).toEqual([trip.id]);
    expect(listTags(opened.db, { includeArchived: true })).toHaveLength(3);
    expect(listTags(opened.db, { updatedSince: trip.updatedAt }).map((tag) => tag.id)).toContain(
      trip.id
    );
    expect(listTags(opened.db, { updatedSince: '9999-01-01T00:00:00.000Z' })).toEqual([]);
  });
});

describe('shared tag hierarchy and updates', () => {
  it('rejects a parent id that does not exist', () => {
    expectServiceError(
      () => createTag('Orphan', { parentId: 'missing-parent-id' }),
      'parent_invalid'
    );
  });

  it('rejects a parent from another facet', () => {
    const hobby = createTag('Cycling', {}, 'hobby');
    expectServiceError(() => createTag('Trip activity', { parentId: hobby.id }), 'parent_invalid');
  });

  it('rejects an archived parent', () => {
    const parent = createTag('Archived parent');
    archiveTag(opened.db, parent.id);
    expectServiceError(
      () => createTag('Child of archived parent', { parentId: parent.id }),
      'parent_invalid'
    );
  });

  it('rejects a two-tag parent cycle', () => {
    const parent = createTag('Parent');
    const child = createTag('Child', { parentId: parent.id });
    expectServiceError(
      () => updateTag(opened.db, parent.id, { parentId: child.id }),
      'parent_invalid'
    );
  });

  it('rejects a three-tag parent cycle', () => {
    const root = createTag('Root');
    const child = createTag('Child', { parentId: root.id });
    const grandchild = createTag('Grandchild', { parentId: child.id });
    expectServiceError(
      () => updateTag(opened.db, root.id, { parentId: grandchild.id }),
      'parent_invalid'
    );
  });

  it('rejects a rename collision and allows the name after the other tag is archived', () => {
    const existing = createTag('Brazil trip');
    const renamed = createTag('Upcoming trip');

    expectServiceError(
      () => updateTag(opened.db, renamed.id, { name: 'BRAZIL TRIP' }),
      'name_conflict'
    );

    archiveTag(opened.db, existing.id);
    expect(updateTag(opened.db, renamed.id, { name: 'BRAZIL TRIP' }).name).toBe('BRAZIL TRIP');
  });

  it('updates name, description, parent, and window together', () => {
    const parent = createTag('Brazil');
    const tag = createTag('Original name');
    const updated = updateTag(opened.db, tag.id, {
      name: 'São Paulo',
      description: 'A city stop',
      parentId: parent.id,
      window: { start: '2026-11-01', end: '2026-11-05', region: 'BR-SP' },
    });

    expect(updated).toMatchObject({
      name: 'São Paulo',
      description: 'A city stop',
      parentId: parent.id,
      windowStart: '2026-11-01',
      windowEnd: '2026-11-05',
      windowRegion: 'BR-SP',
    });
    expect(updated.updatedAt).toMatch(/^\d{4}-\d\d-\d\dT/u);
  });

  it('returns the current record for an empty update patch', () => {
    const tag = createTag('Unchanged');

    expect(updateTag(opened.db, tag.id, {})).toEqual(tag);
  });

  it('rejects inverted windows and a region without a start date', () => {
    expectServiceError(
      () =>
        createTag('Inverted window', {
          window: { start: '2026-11-05', end: '2026-11-01', region: null },
        }),
      'window_invalid'
    );
    expectServiceError(
      () =>
        createTag('Region without start', {
          window: { start: null, end: null, region: 'BR-SP' },
        }),
      'window_invalid'
    );
  });

  it('archives and restores a tag without deleting its row', () => {
    const tag = createTag('Archived then restored');
    expect(archiveTag(opened.db, tag.id).archivedAt).not.toBeNull();
    expect(listTags(opened.db).map((row) => row.id)).not.toContain(tag.id);
    expect(listTags(opened.db, { includeArchived: true }).map((row) => row.id)).toContain(tag.id);

    expect(unarchiveTag(opened.db, tag.id).archivedAt).toBeNull();
    expect(getTag(opened.db, tag.id)?.name).toBe('Archived then restored');
  });

  it('refuses to unarchive a tag that was merged into another identity', () => {
    const source = createTag('Merged source');
    const target = createTag('Merge target');
    mergeTag(opened.db, source.id, target.id);

    expectServiceError(() => unarchiveTag(opened.db, source.id), 'merge_invalid');
  });

  it('refuses to unarchive a tag when its active name is already taken', () => {
    const archived = createTag('Duplicate name');
    archiveTag(opened.db, archived.id);
    createTag('Duplicate name');

    expectServiceError(() => unarchiveTag(opened.db, archived.id), 'name_conflict');
  });

  it('returns not_found for mutations that reference unknown ids', () => {
    const source = createTag('Existing source');
    const target = createTag('Existing target');

    expectServiceError(() => updateTag(opened.db, 'missing', { name: 'Missing' }), 'not_found');
    expectServiceError(() => archiveTag(opened.db, 'missing'), 'not_found');
    expectServiceError(() => unarchiveTag(opened.db, 'missing'), 'not_found');
    expectServiceError(() => mergeTag(opened.db, 'missing', target.id), 'not_found');
    expectServiceError(() => mergeTag(opened.db, source.id, 'missing'), 'not_found');
  });

  it('returns null for an unknown id', () => {
    expect(getTag(opened.db, 'missing-tag-id')).toBeNull();
  });
});

describe('shared tag merge and expansion', () => {
  it('reparents children, flattens merge chains, and preserves source rows', () => {
    const source = createTag('Source');
    const priorSource = createTag('Prior source');
    const middle = createTag('Middle');
    const target = createTag('Target');
    const sourceChild = createTag('Source child', { parentId: source.id });
    const middleChild = createTag('Middle child', { parentId: middle.id });

    mergeTag(opened.db, priorSource.id, middle.id);
    mergeTag(opened.db, source.id, middle.id);
    const mergedMiddle = mergeTag(opened.db, middle.id, target.id);

    expect(mergedMiddle).toMatchObject({ archivedAt: expect.any(String), mergedIntoId: target.id });
    expect(getTag(opened.db, source.id)).toMatchObject({
      archivedAt: expect.any(String),
      mergedIntoId: target.id,
    });
    expect(getTag(opened.db, priorSource.id)?.mergedIntoId).toBe(target.id);
    expect(getTag(opened.db, sourceChild.id)?.parentId).toBe(target.id);
    expect(getTag(opened.db, middleChild.id)?.parentId).toBe(target.id);
    expect(getTag(opened.db, source.id)).not.toBeNull();
    expect(listTags(opened.db, { includeArchived: true })).toHaveLength(6);
  });

  it('refuses to merge a tag into itself', () => {
    const tag = createTag('Same');
    expectServiceError(() => mergeTag(opened.db, tag.id, tag.id), 'merge_invalid');
  });

  it('refuses to merge tags from different facets', () => {
    const trip = createTag('Trip');
    const hobby = createTag('Hobby', {}, 'hobby');
    expectServiceError(() => mergeTag(opened.db, trip.id, hobby.id), 'merge_invalid');
  });

  it('refuses to merge into an archived target', () => {
    const source = createTag('Source');
    const target = createTag('Target');
    archiveTag(opened.db, target.id);
    expectServiceError(() => mergeTag(opened.db, source.id, target.id), 'merge_invalid');
  });

  it('refuses to merge a parent into its descendant', () => {
    const parent = createTag('Parent');
    const child = createTag('Child', { parentId: parent.id });
    expectServiceError(() => mergeTag(opened.db, parent.id, child.id), 'merge_invalid');
  });

  it('expands a merged-away id to its live target, descendants, and merged ids', () => {
    const source = createTag('Source');
    const target = createTag('Target');
    const child = createTag('Child', { parentId: target.id });
    mergeTag(opened.db, source.id, target.id);

    expect(expandTagIds(opened.db, [source.id])).toEqual({
      ids: [child.id, source.id, target.id].toSorted(),
      unknownIds: [],
    });
  });

  it('reports unknown ids without throwing', () => {
    const tag = createTag('Known');
    expect(() => expandTagIds(opened.db, ['unknown-id', tag.id, 'unknown-id'])).not.toThrow();
    expect(expandTagIds(opened.db, ['unknown-id', tag.id, 'unknown-id'])).toEqual({
      ids: [tag.id],
      unknownIds: ['unknown-id'],
    });
  });
});
