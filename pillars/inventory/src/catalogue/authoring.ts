import { eq } from 'drizzle-orm';

import {
  catalogueEvents,
  catalogueRevisions,
  fieldEnumOptions,
  itemTypeFields,
  itemTypes,
} from '../db/schema.js';
import { applyOperation } from './authoring-operations.js';
import {
  currentPublished,
  json,
  requireCatalogue,
  requireCurrentDraft,
} from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { validateCatalogue } from './authoring-validation.js';
import { toCatalogueDescriptor } from './authoring-wire.js';
import { classifyCatalogueCompatibility } from './compatibility.js';

import type { CommandDb } from '../domain/commands/index.js';
import type { CatalogueAuthor, CatalogueDescriptor, DraftOperation } from './authoring-types.js';
import type { CatalogueCompatibilityResult } from './compatibility.js';

export { readCatalogueAudit, toCatalogueDescriptor } from './authoring-wire.js';
export { publishCatalogueDraft } from './authoring-publication.js';
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

/** Applies draft operations and returns the candidate compatibility proof. */
export function patchCatalogueDraft(
  db: CommandDb,
  revision: number,
  baseRevision: number,
  operations: readonly DraftOperation[]
): { draft: CatalogueDescriptor; compatibility: CatalogueCompatibilityResult } {
  return db.transaction((tx) => {
    requireCurrentDraft(tx, revision, baseRevision);
    for (const operation of operations) applyOperation(tx, revision, operation);
    const draft = requireCatalogue(tx, revision, ['draft']);
    validateCatalogue(draft);
    const base = requireCatalogue(tx, baseRevision, ['published']);
    return {
      draft: toCatalogueDescriptor(tx, draft),
      compatibility: classifyCatalogueCompatibility(base, draft),
    };
  });
}

/** Abandons a draft while retaining its immutable definition rows and audit. */
export function abandonCatalogueDraft(
  db: CommandDb,
  revision: number,
  baseRevision: number,
  author: CatalogueAuthor
): CatalogueDescriptor {
  return db.transaction((tx) => {
    const draft = requireCurrentDraft(tx, revision, baseRevision);
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
        beforeJson: json(toCatalogueDescriptor(tx, draft)),
        afterJson: json(toCatalogueDescriptor(tx, abandoned)),
        migrationName: null,
        affectedItems: 0,
        serverTime: now,
      })
      .run();
    return toCatalogueDescriptor(tx, abandoned);
  });
}
