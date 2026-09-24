import { catalogueRevisions } from '../db/schema.js';
import { applyOperation } from './authoring-operations.js';
import { currentPublished, requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { copyDraftRows } from './authoring.js';
import { evaluateOn, PreviewRollback, previewOutcome } from './computed-field-preview.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftOperation } from './authoring-types.js';
import type { PersistedCatalogue } from './catalogue-types.js';
import type {
  ComputedFieldPreview,
  ComputedFieldPreviewSubject,
} from './computed-field-preview-types.js';

const SCRATCH_DRAFT_CONFLICT = 'catalogue_revisions_one_draft';

/**
 * Clones the published catalogue into a throwaway, never-committed revision.
 * Definition rows may only be written while their revision's status is
 * `draft` (the schema enforces this with a trigger), so the scratch revision
 * is itself created as a draft; the surrounding transaction always rolls
 * back, so it is never observed as a second draft by anything else. A real
 * draft already in progress collides with the one-draft-at-a-time unique
 * index, which is reported as a conflict rather than a 500.
 */
function scratchPublishedRevision(db: CommandDb, published: PersistedCatalogue): number {
  const now = new Date().toISOString();
  let created: { revision: number };
  try {
    created = db
      .insert(catalogueRevisions)
      .values({
        baseRevision: published.revision.revision,
        status: 'draft',
        minimumProtocol: published.revision.minimumProtocol,
        createdActorKind: 'service',
        createdActorLabel: 'computed-field-preview',
        createdAt: now,
      })
      .returning({ revision: catalogueRevisions.revision })
      .get();
  } catch (error) {
    if (error instanceof Error && error.message.includes(SCRATCH_DRAFT_CONFLICT)) {
      throw new CatalogueApiError(
        409,
        'catalogue_conflict',
        'A catalogue draft is already in progress; read it and preview against the draft instead'
      );
    }
    throw error;
  }
  copyDraftRows(db, published.revision.revision, created.revision);
  return created.revision;
}

function evaluateOnPublished(
  db: CommandDb,
  baseRevision: number,
  operations: readonly DraftOperation[],
  subject: ComputedFieldPreviewSubject
): ComputedFieldPreview {
  const published = requireCatalogue(db, baseRevision, ['published']);
  const current = currentPublished(db);
  if (current.revision.revision !== published.revision.revision) {
    throw new CatalogueApiError(409, 'catalogue_conflict', 'The published catalogue has changed');
  }
  const scratchRevision = scratchPublishedRevision(db, published);
  for (const operation of operations) applyOperation(db, scratchRevision, operation);
  const evaluation = evaluateOn(db, scratchRevision, subject);
  return previewOutcome(
    db,
    { baseRevision, draftRevision: null, draftVersion: null },
    subject,
    evaluation
  );
}

/**
 * Evaluates an unsaved computed field's expression on one item against the
 * published catalogue, with optional unsaved operations applied first to a
 * scratch, never-committed copy of it. No draft is required or created, and
 * nothing is written: the scratch copy, the item and any override are left
 * exactly as they were. Refused with `catalogue_conflict` when the published
 * catalogue has moved since `baseRevision` was read.
 */
export function previewComputedFieldOnPublished(
  db: CommandDb,
  baseRevision: number,
  operations: readonly DraftOperation[],
  subject: ComputedFieldPreviewSubject
): ComputedFieldPreview {
  try {
    db.transaction((tx) => {
      throw new PreviewRollback(evaluateOnPublished(tx, baseRevision, operations, subject));
    });
  } catch (error) {
    if (error instanceof PreviewRollback) return error.preview;
    throw error;
  }
  throw new Error('Computed-field preview transaction completed without rolling back');
}
