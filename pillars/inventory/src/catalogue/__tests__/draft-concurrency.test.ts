import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { openMigratedTestDb, type MigratedTestDb } from '../../db/__tests__/migrated-db.js';
import {
  abandonCatalogueDraft,
  CatalogueApiError,
  createCatalogueDraft,
  patchCatalogueDraft,
  previewCatalogueDraft,
  publishCatalogueDraft,
  readCurrentCatalogueDraft,
} from '../authoring.js';

import type { CatalogueDescriptor } from '../authoring.js';

const AUTHOR = { kind: 'web', id: 'owner', label: 'Owner' } as const;
const BASE_REVISION = 1;

let database: MigratedTestDb;

beforeEach(() => {
  database = openMigratedTestDb();
});

afterEach(() => {
  database.raw.close();
});

function firstType(draft: CatalogueDescriptor) {
  const type = draft.types[0];
  if (type === undefined) throw new Error('the built-in catalogue has no types');
  return type;
}

function labelOf(draft: CatalogueDescriptor, typeId: string): string | undefined {
  return draft.types.find((type) => type.id === typeId)?.label;
}

function target(draft: CatalogueDescriptor) {
  return {
    revision: draft.revision.revision,
    baseRevision: BASE_REVISION,
    expectedDraftVersion: draft.revision.draftVersion,
  };
}

function persistedVersion(revision: number): number {
  const row = database.raw
    .prepare('SELECT draft_version FROM catalogue_revisions WHERE revision = ?')
    .get(revision) as { draft_version: number } | undefined;
  if (row === undefined) throw new Error(`revision ${revision} is missing`);
  return row.draft_version;
}

function auditRows(): readonly { revision: number; kind: string }[] {
  return database.raw.prepare('SELECT revision, kind FROM catalogue_events ORDER BY id').all() as {
    revision: number;
    kind: string;
  }[];
}

function catchApiError(operation: () => unknown): CatalogueApiError {
  try {
    operation();
  } catch (error) {
    if (error instanceof CatalogueApiError) return error;
    throw error;
  }
  throw new Error('expected the operation to be rejected');
}

describe('catalogue draft optimistic concurrency', () => {
  it('starts a draft at version 1 and advances it once per successful mutation', () => {
    const created = createCatalogueDraft(database.db, BASE_REVISION, AUTHOR);
    const type = firstType(created);

    const first = patchCatalogueDraft(database.db, target(created), [
      { kind: 'put_type', id: type.id, label: 'First' },
      { kind: 'put_type', id: type.id, description: 'Two fields in one batch' },
    ]);
    const second = patchCatalogueDraft(database.db, target(first.draft), [
      { kind: 'put_type', id: type.id, label: 'Second' },
    ]);

    expect(created.revision.draftVersion).toBe(1);
    expect(first.draft.revision.draftVersion).toBe(2);
    expect(second.draft.revision.draftVersion).toBe(3);
    expect(persistedVersion(created.revision.revision)).toBe(3);
    expect(readCurrentCatalogueDraft(database.db).revision.draftVersion).toBe(3);
  });

  it('rejects the second of two editors that read the same version without overwriting', () => {
    const created = createCatalogueDraft(database.db, BASE_REVISION, AUTHOR);
    const type = firstType(created);
    const editorA = readCurrentCatalogueDraft(database.db);
    const editorB = readCurrentCatalogueDraft(database.db);

    patchCatalogueDraft(database.db, target(editorA), [
      { kind: 'put_type', id: type.id, label: 'Editor A' },
    ]);
    const conflict = catchApiError(() =>
      patchCatalogueDraft(database.db, target(editorB), [
        { kind: 'put_type', id: type.id, label: 'Editor B' },
      ])
    );

    expect(conflict).toMatchObject({
      status: 409,
      code: 'catalogue_draft_conflict',
      currentDraftVersion: 2,
    });
    expect(conflict.message).toContain('version 2, not 1');
    const persisted = readCurrentCatalogueDraft(database.db);
    expect(labelOf(persisted, type.id)).toBe('Editor A');
    expect(persisted.revision.draftVersion).toBe(2);
  });

  it('rolls back a whole batch and keeps the version when validation fails', () => {
    const created = createCatalogueDraft(database.db, BASE_REVISION, AUTHOR);
    const type = firstType(created);

    const failure = catchApiError(() =>
      patchCatalogueDraft(database.db, target(created), [
        { kind: 'put_type', id: type.id, label: 'Should not persist' },
        {
          kind: 'put_field',
          typeId: type.id,
          key: 'bad_unit',
          label: 'Bad unit',
          fieldKind: 'short_text',
          cardinality: 'one',
          storage: 'stored',
          fixedUnit: 'V',
        },
      ])
    );
    const retried = patchCatalogueDraft(database.db, target(created), [
      { kind: 'put_type', id: type.id, label: 'Retried' },
    ]);

    expect(failure).toMatchObject({ status: 400, code: 'catalogue_validation_failed' });
    expect(retried.draft.revision.draftVersion).toBe(2);
    expect(labelOf(retried.draft, type.id)).toBe('Retried');
    expect(
      retried.draft.types.flatMap((entry) => entry.fields).some((field) => field.key === 'bad_unit')
    ).toBe(false);
  });

  it('refuses an edit that loses the race to publication and leaves the publication intact', () => {
    const created = createCatalogueDraft(database.db, BASE_REVISION, AUTHOR);
    const type = firstType(created);
    const edited = patchCatalogueDraft(database.db, target(created), [
      { kind: 'put_type', id: type.id, label: 'Published label' },
    ]).draft;

    const published = publishCatalogueDraft(
      database.db,
      edited.revision.revision,
      { baseRevision: BASE_REVISION, expectedDraftVersion: 2, note: null },
      AUTHOR
    );
    const auditAfterPublication = auditRows();
    const conflict = catchApiError(() =>
      patchCatalogueDraft(database.db, target(edited), [
        { kind: 'put_type', id: type.id, label: 'Late edit' },
      ])
    );

    expect(published.revision).toMatchObject({ status: 'published', draftVersion: 3 });
    expect(conflict).toMatchObject({
      status: 409,
      code: 'catalogue_draft_conflict',
      currentDraftVersion: 3,
    });
    expect(conflict.message).toContain('already published');
    expect(auditRows()).toEqual(auditAfterPublication);
    expect(persistedVersion(edited.revision.revision)).toBe(3);
  });

  it('refuses a publication that loses the race to an edit without auditing or promoting it', () => {
    const created = createCatalogueDraft(database.db, BASE_REVISION, AUTHOR);
    const type = firstType(created);
    const auditBefore = auditRows();
    const syncRevision = database.raw
      .prepare(`SELECT value FROM sync_meta WHERE key = 'catalogue_revision'`)
      .get();

    patchCatalogueDraft(database.db, target(created), [
      { kind: 'put_type', id: type.id, label: 'Newer edit' },
    ]);
    const conflict = catchApiError(() =>
      publishCatalogueDraft(
        database.db,
        created.revision.revision,
        { baseRevision: BASE_REVISION, expectedDraftVersion: 1, note: 'stale' },
        AUTHOR
      )
    );

    expect(conflict).toMatchObject({ status: 409, currentDraftVersion: 2 });
    expect(readCurrentCatalogueDraft(database.db).revision).toMatchObject({
      status: 'draft',
      draftVersion: 2,
    });
    expect(auditRows()).toEqual(auditBefore);
    expect(
      database.raw.prepare(`SELECT value FROM sync_meta WHERE key = 'catalogue_revision'`).get()
    ).toEqual(syncRevision);
  });

  it('refuses a stale abandonment and keeps the draft editable', () => {
    const created = createCatalogueDraft(database.db, BASE_REVISION, AUTHOR);
    const type = firstType(created);
    const edited = patchCatalogueDraft(database.db, target(created), [
      { kind: 'put_type', id: type.id, label: 'Keep me' },
    ]).draft;
    const auditBefore = auditRows();

    const conflict = catchApiError(() =>
      abandonCatalogueDraft(database.db, target(created), AUTHOR)
    );
    const abandoned = abandonCatalogueDraft(database.db, target(edited), AUTHOR);

    expect(conflict).toMatchObject({ status: 409, code: 'catalogue_draft_conflict' });
    expect(auditRows()).toEqual([
      ...auditBefore,
      { revision: created.revision.revision, kind: 'abandoned' },
    ]);
    expect(abandoned.revision).toMatchObject({ status: 'abandoned', draftVersion: 3 });
  });

  it('checks the version on preview without advancing it', () => {
    const created = createCatalogueDraft(database.db, BASE_REVISION, AUTHOR);
    const type = firstType(created);
    const operation = { kind: 'put_type', id: type.id, label: 'Previewed' } as const;

    previewCatalogueDraft(database.db, target(created), [operation]);
    const edited = patchCatalogueDraft(database.db, target(created), [operation]).draft;
    const conflict = catchApiError(() =>
      previewCatalogueDraft(database.db, target(created), [operation])
    );

    expect(edited.revision.draftVersion).toBe(2);
    expect(conflict).toMatchObject({ status: 409, currentDraftVersion: 2 });
    expect(persistedVersion(created.revision.revision)).toBe(2);
  });

  it('reports an unknown draft revision as missing rather than as a conflict', () => {
    const conflict = catchApiError(() =>
      patchCatalogueDraft(
        database.db,
        { revision: 999, baseRevision: BASE_REVISION, expectedDraftVersion: 1 },
        [{ kind: 'put_type', key: 'x', label: 'X' }]
      )
    );

    expect(conflict).toMatchObject({ status: 404, code: 'catalogue_revision_unknown' });
  });
});
