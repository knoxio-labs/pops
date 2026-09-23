import { and, eq, sql } from 'drizzle-orm';

import { catalogueRevisions } from '../db/schema.js';
import { currentPublished, requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { PersistedCatalogue } from './catalogue-types.js';

function requireCurrentDraft(
  db: CommandDb,
  revision: number,
  baseRevision: number
): PersistedCatalogue {
  const draft = requireCatalogue(db, revision, ['draft']);
  if (draft.revision.baseRevision !== baseRevision) {
    throw new CatalogueApiError(409, 'catalogue_conflict', 'The draft base revision is stale');
  }
  const current = currentPublished(db);
  if (current.revision.revision !== baseRevision) {
    throw new CatalogueApiError(409, 'catalogue_conflict', 'The published catalogue has changed');
  }
  return draft;
}

function draftVersionConflict(
  db: CommandDb,
  revision: number,
  expectedDraftVersion: number
): CatalogueApiError {
  const row = db
    .select({ status: catalogueRevisions.status, draftVersion: catalogueRevisions.draftVersion })
    .from(catalogueRevisions)
    .where(eq(catalogueRevisions.revision, revision))
    .get();
  if (row === undefined) {
    return new CatalogueApiError(
      404,
      'catalogue_revision_unknown',
      `Catalogue revision ${revision} was not found`
    );
  }
  const message =
    row.status === 'draft'
      ? `Catalogue draft ${revision} is at version ${row.draftVersion}, not ${expectedDraftVersion}; re-read the draft and reapply the change against version ${row.draftVersion}`
      : `Catalogue draft ${revision} was already ${row.status}; read the current catalogue before starting a new draft`;
  return new CatalogueApiError(409, 'catalogue_draft_conflict', message, {
    currentDraftVersion: row.draftVersion,
  });
}

/**
 * Compare-and-swaps the draft's version inside the caller's transaction, then
 * checks its published base. The conditional update is the first write so the
 * transaction holds SQLite's write lock before anything is read or validated,
 * and a rollback of the caller's mutation also rolls the version back.
 */
export function claimCurrentDraft(
  db: CommandDb,
  revision: number,
  baseRevision: number,
  expectedDraftVersion: number
): PersistedCatalogue {
  const claimed = db
    .update(catalogueRevisions)
    .set({ draftVersion: sql`${catalogueRevisions.draftVersion} + 1` })
    .where(
      and(
        eq(catalogueRevisions.revision, revision),
        eq(catalogueRevisions.status, 'draft'),
        eq(catalogueRevisions.draftVersion, expectedDraftVersion)
      )
    )
    .run();
  if (claimed.changes !== 1) throw draftVersionConflict(db, revision, expectedDraftVersion);
  return requireCurrentDraft(db, revision, baseRevision);
}
