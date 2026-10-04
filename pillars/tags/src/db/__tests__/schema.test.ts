import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openTagsDb, type OpenedTagsDb } from '../index.js';
import { tags } from '../schema/tags.js';

let directory: string;
let opened: OpenedTagsDb;

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'tags-db-test-'));
  opened = openTagsDb(join(directory, 'tags.db'));
});

afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('tags schema constraints', () => {
  it('rejects a window whose end precedes its start', () => {
    expect(() =>
      opened.db
        .insert(tags)
        .values({
          facet: 'trip',
          name: 'Invalid window',
          windowStart: '2026-10-10',
          windowEnd: '2026-10-01',
        })
        .run()
    ).toThrow(/ck_tags_window_bounds/u);
  });

  it('requires a start date when a window region is set', () => {
    expect(() =>
      opened.db
        .insert(tags)
        .values({ facet: 'trip', name: 'Region only', windowRegion: 'BR' })
        .run()
    ).toThrow(/ck_tags_window_region_requires_start/u);
  });

  it('requires archived_at when a tag points to its merged replacement', () => {
    expect(() =>
      opened.db
        .insert(tags)
        .values({
          facet: 'trip',
          name: 'Merged without archive',
          mergedIntoId: 'c854613c-1765-4d8b-9f9c-64a87fb6c28f',
        })
        .run()
    ).toThrow(/ck_tags_merged_requires_archived/u);
  });

  it('uniquely indexes active names case-insensitively within a facet', () => {
    opened.db.insert(tags).values({ facet: 'trip', name: 'Trip' }).run();

    expect(() => opened.db.insert(tags).values({ facet: 'trip', name: 'trip' }).run()).toThrow(
      /UNIQUE constraint failed/u
    );
    expect(() =>
      opened.db.insert(tags).values({ facet: 'hobby', name: 'trip' }).run()
    ).not.toThrow();

    opened.db
      .update(tags)
      .set({ archivedAt: '2026-10-03T00:00:00.000Z' })
      .where(eq(tags.name, 'Trip'))
      .run();
    expect(() =>
      opened.db.insert(tags).values({ facet: 'trip', name: 'trip' }).run()
    ).not.toThrow();
  });
});
