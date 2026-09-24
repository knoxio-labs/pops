import { eq } from 'drizzle-orm';

import { catalogueRevisions } from '../db/schema.js';
import { PERSISTED_CATALOGUE_PROTOCOL, readMinimumProtocol } from '../protocol/rollout.js';
import { claimCurrentDraft } from './authoring-draft-version.js';
import { migrationInput } from './authoring-migration.js';
import { writePublication } from './authoring-publication-write.js';
import { issue, requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { validateCatalogue } from './authoring-validation.js';
import { toCatalogueDescriptor } from './authoring-wire.js';
import { assessCatalogueCompatibility } from './compatibility-preview.js';
import { clearComputedValueCache } from './computed-value-runtime-cache.js';

import type { CommandDb } from '../domain/commands/index.js';
import type {
  CatalogueAuthor,
  CatalogueDescriptor,
  CatalogueIssue,
  CataloguePreviewDiagnostics,
  CataloguePublicationInput,
} from './authoring-types.js';
import type { PersistedCatalogue } from './catalogue-types.js';
import type { CatalogueCompatibilityAssessment } from './compatibility-preview.js';
import type { CatalogueMigration } from './migrations.js';

interface PublicationCandidate {
  readonly base: PersistedCatalogue;
  readonly candidate: PersistedCatalogue;
  readonly compatibility: CatalogueCompatibilityAssessment;
}

function assessPublication(
  db: CommandDb,
  revision: number,
  input: CataloguePublicationInput
): PublicationCandidate {
  const candidate = requireCatalogue(db, revision, ['draft']);
  const base = requireCatalogue(db, input.baseRevision, ['published']);
  return { base, candidate, compatibility: assessCatalogueCompatibility(db, base, candidate) };
}

function gatesVocabulary(compatibility: CatalogueCompatibilityAssessment): boolean {
  return compatibility.changes.some(
    (change) =>
      change.classification === 'protocol_gated' && change.code !== 'minimum_protocol_increased'
  );
}

function setDraftMinimumProtocol(db: CommandDb, revision: number, minimumProtocol: number): void {
  db.update(catalogueRevisions)
    .set({ minimumProtocol })
    .where(eq(catalogueRevisions.revision, revision))
    .run();
}

function diagnostics(
  baseRevision: number,
  draftRevision: number,
  compatibility: CatalogueCompatibilityAssessment
): CataloguePreviewDiagnostics {
  return { baseRevision, draftRevision, compatibility };
}

/**
 * Raises the draft's minimum protocol to cover any protocol-gated vocabulary,
 * then refuses publication while the persisted rollout minimum is below it.
 */
function applyProtocolGate(
  db: CommandDb,
  revision: number,
  input: CataloguePublicationInput
): PublicationCandidate {
  if (input.minimumProtocol !== undefined) {
    setDraftMinimumProtocol(db, revision, input.minimumProtocol);
  }
  let publication = assessPublication(db, revision, input);
  if (
    gatesVocabulary(publication.compatibility) &&
    publication.candidate.revision.minimumProtocol < PERSISTED_CATALOGUE_PROTOCOL
  ) {
    setDraftMinimumProtocol(db, revision, PERSISTED_CATALOGUE_PROTOCOL);
    publication = assessPublication(db, revision, input);
  }
  const required = publication.candidate.revision.minimumProtocol;
  const active = readMinimumProtocol(db);
  if (required > active) {
    throw new CatalogueApiError(
      409,
      'protocol_rollout_required',
      `Activate inventory protocol ${required} before publishing this catalogue; the active minimum is ${active}`,
      { preview: diagnostics(input.baseRevision, revision, publication.compatibility) }
    );
  }
  return publication;
}

function changeIssues(compatibility: CatalogueCompatibilityAssessment): CatalogueIssue[] {
  return compatibility.changes.map((change) =>
    issue(change.definitionId, '$', change.code, change.code)
  );
}

function requireMigration(
  compatibility: CatalogueCompatibilityAssessment,
  input: CataloguePublicationInput,
  fromRevision: number,
  toRevision: number
): CatalogueMigration | undefined {
  const preview = diagnostics(fromRevision, toRevision, compatibility);
  if (compatibility.classification === 'forbidden') {
    throw new CatalogueApiError(
      409,
      'catalogue_change_forbidden',
      'The draft contains a forbidden published-identity change',
      { issues: changeIssues(compatibility), preview }
    );
  }
  const migration = migrationInput(input, fromRevision, toRevision);
  if (compatibility.classification === 'migration_required' && migration === undefined) {
    throw new CatalogueApiError(
      409,
      'catalogue_migration_required',
      'Publication requires a named value migration',
      { issues: changeIssues(compatibility), preview }
    );
  }
  if (migration !== undefined && compatibility.classification !== 'migration_required') {
    throw new CatalogueApiError(
      400,
      'migration_not_required',
      'A migration is only accepted for a migration-required publication'
    );
  }
  return migration;
}

/**
 * Publishes a draft atomically, including dry-run migration and search rebuild.
 * Vocabulary the base never used raises the catalogue minimum protocol, and
 * publication waits until the persisted rollout minimum reaches it.
 */
export function publishCatalogueDraft(
  db: CommandDb,
  revision: number,
  input: CataloguePublicationInput,
  author: CatalogueAuthor
): CatalogueDescriptor {
  const descriptor = db.transaction((tx) => {
    claimCurrentDraft(tx, revision, input.baseRevision, input.expectedDraftVersion);
    const { base, candidate, compatibility } = applyProtocolGate(tx, revision, input);
    validateCatalogue(candidate);
    const migration = requireMigration(compatibility, input, input.baseRevision, revision);
    return writePublication({
      db: tx,
      revision,
      input,
      author,
      base,
      candidate,
      compatibility,
      migration,
    });
  });
  clearComputedValueCache(db);
  return descriptor;
}

export type {
  CataloguePublicationInput,
  CataloguePublicationInput as PublicationInput,
} from './authoring-types.js';
export { toCatalogueDescriptor };
