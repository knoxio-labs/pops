import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openFinanceDb, type OpenedFinanceDb, sharedTagLinksService } from '../index.js';
import { tagVocabulary } from '../schema.js';

let opened: OpenedFinanceDb;
let directory: string;

function insertTag(input: {
  tag: string;
  facet: string;
  sharedTagId?: string;
  isActive?: boolean;
  usageCount?: number;
}): void {
  opened.db
    .insert(tagVocabulary)
    .values({
      tag: input.tag,
      facet: input.facet,
      kind: 'open',
      source: 'user',
      sharedTagId: input.sharedTagId ?? null,
      isActive: input.isActive ?? true,
      usageCount: input.usageCount ?? 0,
    })
    .onConflictDoUpdate({
      target: tagVocabulary.tag,
      set: {
        facet: input.facet,
        kind: 'open',
        source: 'user',
        sharedTagId: input.sharedTagId ?? null,
        isActive: input.isActive ?? true,
        usageCount: input.usageCount ?? 0,
      },
    })
    .run();
}

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'finance-shared-tag-links-'));
  opened = openFinanceDb(join(directory, 'finance.db'));
  opened.db.delete(tagVocabulary).run();
});

afterEach(() => {
  opened.raw.close();
  rmSync(directory, { recursive: true, force: true });
});

describe('sharedTagLinksService', () => {
  it('lists only active unlinked vocabulary on shared facets and looks up shared ids', () => {
    insertTag({ tag: 'trip:shared-link-active', facet: 'trip', usageCount: 8 });
    insertTag({ tag: 'hobby:shared-link-inactive', facet: 'hobby', isActive: false });
    insertTag({ tag: 'venue:shared-link-venue', facet: 'venue' });
    insertTag({
      tag: 'project:shared-link-project',
      facet: 'project',
      sharedTagId: 'shared-project',
    });

    const unlinked = sharedTagLinksService.listUnlinkedActiveSharedVocabularyTags(opened.db);
    expect(unlinked).toContainEqual(
      expect.objectContaining({ tag: 'trip:shared-link-active', usageCount: 8 })
    );
    expect(unlinked.map((row) => row.tag)).not.toContain('hobby:shared-link-inactive');
    expect(unlinked.map((row) => row.tag)).not.toContain('venue:shared-link-venue');
    expect(unlinked.map((row) => row.tag)).not.toContain('project:shared-link-project');
    expect(
      sharedTagLinksService.listVocabularyTagsBySharedIds(opened.db, ['shared-project'])
    ).toMatchObject([{ tag: 'project:shared-link-project', sharedTagId: 'shared-project' }]);
    expect(sharedTagLinksService.listVocabularyTagsBySharedIds(opened.db, [])).toEqual([]);
  });

  it('links existing rows without changing their local string or usage count', () => {
    insertTag({ tag: 'trip:Shared Link CAS Test', facet: 'trip', usageCount: 17 });

    expect(
      sharedTagLinksService.linkVocabularyTag(opened.db, {
        tag: 'trip:Shared Link CAS Test',
        sharedTagId: 'shared-cairns',
        isActive: true,
      })
    ).toEqual({ kind: 'linked', tag: 'trip:Shared Link CAS Test' });
    expect(
      opened.db
        .select()
        .from(tagVocabulary)
        .where(eq(tagVocabulary.tag, 'trip:Shared Link CAS Test'))
        .get()
    ).toMatchObject({
      tag: 'trip:Shared Link CAS Test',
      sharedTagId: 'shared-cairns',
      usageCount: 17,
    });
  });

  it('creates slugged shared rows, preserves the local key on rename, and mirrors retirement', () => {
    expect(
      sharedTagLinksService.upsertSharedTagVocabulary(opened.db, {
        sharedTagId: 'shared-cafe',
        facet: 'hobby',
        name: 'Café Shared Link Test',
        isActive: true,
      })
    ).toEqual({ kind: 'linked', tag: 'hobby:cafe-shared-link-test' });

    expect(
      sharedTagLinksService.upsertSharedTagVocabulary(opened.db, {
        sharedTagId: 'shared-cafe',
        facet: 'hobby',
        name: 'Coffee Lovers',
        isActive: false,
      })
    ).toEqual({ kind: 'updated', tag: 'hobby:cafe-shared-link-test' });
    expect(
      opened.db
        .select()
        .from(tagVocabulary)
        .where(eq(tagVocabulary.tag, 'hobby:cafe-shared-link-test'))
        .get()
    ).toMatchObject({
      tag: 'hobby:cafe-shared-link-test',
      sharedTagId: 'shared-cafe',
      isActive: false,
      usageCount: 0,
    });
  });

  it('reports a shared id collision without linking the other local row', () => {
    insertTag({ tag: 'trip:shared-link-trip', facet: 'trip', sharedTagId: 'shared-cairns' });
    insertTag({ tag: 'hobby:shared-link-hobby', facet: 'hobby', usageCount: 4 });

    expect(
      sharedTagLinksService.linkVocabularyTag(opened.db, {
        tag: 'hobby:shared-link-hobby',
        sharedTagId: 'shared-cairns',
        isActive: true,
      })
    ).toEqual({ kind: 'conflict', reason: 'shared-id', existingTag: 'trip:shared-link-trip' });
    expect(
      opened.db
        .select()
        .from(tagVocabulary)
        .where(eq(tagVocabulary.tag, 'hobby:shared-link-hobby'))
        .get()
    ).toMatchObject({ tag: 'hobby:shared-link-hobby', sharedTagId: null, usageCount: 4 });
  });
});
