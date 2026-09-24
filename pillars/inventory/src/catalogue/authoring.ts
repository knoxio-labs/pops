import { eq } from 'drizzle-orm';

import {
  catalogueEvents,
  catalogueRevisions,
  fieldEnumOptions,
  itemTypeFields,
  itemTypes,
} from '../db/schema.js';
import { applyDraftOperations } from './authoring-draft-operations.js';
import { claimCurrentDraft } from './authoring-draft-version.js';
import { currentPublished, json, requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { toCatalogueDescriptor } from './authoring-wire.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { DraftTarget } from './authoring-draft-operations.js';
import type { CatalogueAuthor, CatalogueDescriptor, DraftOperation } from './authoring-types.js';
import type { CatalogueCompatibilityAssessment } from './compatibility-preview.js';

export { readCatalogueAudit, toCatalogueDescriptor } from './authoring-wire.js';
export { publishCatalogueDraft, publishCatalogueDraftWith } from './authoring-publication.js';
export { previewCatalogueDraft } from './authoring-draft-operations.js';
export type { DraftTarget } from './authoring-draft-operations.js';
export { CatalogueApiError } from './authoring-types.js';
export type { CataloguePublicationInput } from './authoring-publication.js';
export type {
  CatalogueActor,
  CatalogueAuditWire,
  CatalogueAuthor,
  CatalogueDescriptor,
  CatalogueFieldWire,
  CatalogueIssue,
  CatalogueOptionWire,
  CatalogueRevisionWire,
  CatalogueTypeWire,
} from './authoring-types.js';

/** Reads the one editable draft, when authoring is already in progress. */
export function readCurrentCatalogueDraft(db: CommandDb): CatalogueDescriptor {
  const row = db
    .select({ revision: catalogueRevisions.revision })
    .from(catalogueRevisions)
    .where(eq(catalogueRevisions.status, 'draft'))
    .get();
  if (row === undefined) {
    throw new CatalogueApiError(404, 'catalogue_draft_missing', 'No catalogue draft exists');
  }
  return toCatalogueDescriptor(db, requireCatalogue(db, row.revision, ['draft']));
}

function actorColumns(author: CatalogueAuthor): {
  createdActorKind: 'web' | 'service';
  createdActorId: string;
  createdActorLabel: string;
} {
  return {
    createdActorKind: author.kind,
    createdActorId: author.id,
    createdActorLabel: author.label,
  };
}

function copyDraftRows(db: CommandDb, baseRevision: number, revision: number): void {
  const types = db.select().from(itemTypes).where(eq(itemTypes.revision, baseRevision)).all();
  for (const type of types)
    db.insert(itemTypes)
      .values({ ...type, revision })
      .run();
  const fields = db
    .select()
    .from(itemTypeFields)
    .where(eq(itemTypeFields.revision, baseRevision))
    .all();
  for (const field of fields)
    db.insert(itemTypeFields)
      .values({ ...field, revision })
      .run();
  const options = db
    .select()
    .from(fieldEnumOptions)
    .where(eq(fieldEnumOptions.revision, baseRevision))
    .all();
  for (const option of options)
    db.insert(fieldEnumOptions)
      .values({ ...option, revision })
      .run();
}

/** Creates the single editable draft from the requested current revision. */
export function createCatalogueDraft(
  db: CommandDb,
  baseRevision: number,
  author: CatalogueAuthor
): CatalogueDescriptor {
  return db.transaction((tx) => {
    const current = currentPublished(tx);
    if (current.revision.revision !== baseRevision) {
      throw new CatalogueApiError(
        409,
        'catalogue_conflict',
        'The requested base revision is not current'
      );
    }
    const existingDraft = tx
      .select({ revision: catalogueRevisions.revision })
      .from(catalogueRevisions)
      .where(eq(catalogueRevisions.status, 'draft'))
      .get();
    if (existingDraft !== undefined) {
      throw new CatalogueApiError(
        409,
        'draft_exists',
        `Catalogue draft ${existingDraft.revision} already exists`
      );
    }
    const created = tx
      .insert(catalogueRevisions)
      .values({
        baseRevision,
        status: 'draft',
        minimumProtocol: current.revision.minimumProtocol,
        ...actorColumns(author),
        createdAt: new Date().toISOString(),
      })
      .returning({ revision: catalogueRevisions.revision })
      .get();
    copyDraftRows(tx, baseRevision, created.revision);
    return toCatalogueDescriptor(tx, requireCatalogue(tx, created.revision, ['draft']));
  });
}

/**
 * Applies draft operations atomically and returns the candidate compatibility
 * proof. The batch commits only when `target.expectedDraftVersion` is still the
 * draft's version, and the returned draft carries the advanced version.
 */
export function patchCatalogueDraft(
  db: CommandDb,
  target: DraftTarget,
  operations: readonly DraftOperation[]
): {
  draft: CatalogueDescriptor;
  compatibility: CatalogueCompatibilityAssessment;
} {
  return db.transaction((tx) => applyDraftOperations(tx, target, operations));
}

/**
 * Abandons a draft while retaining its immutable definition rows and audit,
 * provided `target.expectedDraftVersion` is still the draft's version.
 */
export function abandonCatalogueDraft(
  db: CommandDb,
  target: DraftTarget,
  author: CatalogueAuthor
): CatalogueDescriptor {
  const { revision, baseRevision, expectedDraftVersion } = target;
  return db.transaction((tx) => {
    const before = toCatalogueDescriptor(
      tx,
      claimCurrentDraft(tx, revision, baseRevision, expectedDraftVersion)
    );
    const now = new Date().toISOString();
    tx.update(catalogueRevisions)
      .set({
        status: 'abandoned',
        abandonedActorKind: author.kind,
        abandonedActorId: author.id,
        abandonedActorLabel: author.label,
        abandonedAt: now,
      })
      .where(eq(catalogueRevisions.revision, revision))
      .run();
    const abandoned = requireCatalogue(tx, revision, ['abandoned']);
    tx.insert(catalogueEvents)
      .values({
        revision,
        kind: 'abandoned',
        actorKind: author.kind,
        actorId: author.id,
        actorLabel: author.label,
        beforeJson: json(before),
        afterJson: json(toCatalogueDescriptor(tx, abandoned)),
        migrationName: null,
        affectedItems: 0,
        serverTime: now,
      })
      .run();
    return toCatalogueDescriptor(tx, abandoned);
  });
}
