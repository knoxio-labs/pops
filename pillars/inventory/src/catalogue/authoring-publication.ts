import { eq } from 'drizzle-orm';

import { catalogueRevisions } from '../db/schema.js';
import { claimCurrentDraft } from './authoring-draft-version.js';
import { migrationInput } from './authoring-migration.js';
import { writePublication } from './authoring-publication-write.js';
import { issue, requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { validateCatalogue } from './authoring-validation.js';
import { toCatalogueDescriptor } from './authoring-wire.js';
import { classifyCatalogueCompatibility } from './compatibility.js';
import { clearComputedValueCache } from './computed-value-runtime-cache.js';

import type { CommandDb } from '../domain/commands/index.js';
import type {
  CatalogueAuthor,
  CatalogueDescriptor,
  CataloguePublicationInput,
} from './authoring-types.js';
import type { CatalogueCompatibilityResult } from './compatibility.js';
import type { CatalogueMigration } from './migrations.js';

function publicationCompatibility(
  db: CommandDb,
  revision: number,
  input: CataloguePublicationInput
): {
  base: ReturnType<typeof requireCatalogue>;
  candidate: ReturnType<typeof requireCatalogue>;
  compatibility: CatalogueCompatibilityResult;
} {
  const candidate = requireCatalogue(db, revision, ['draft']);
  const base = requireCatalogue(db, input.baseRevision, ['published']);
  return { base, candidate, compatibility: classifyCatalogueCompatibility(base, candidate) };
}

function requireMigration(
  compatibility: CatalogueCompatibilityResult,
  input: CataloguePublicationInput,
  fromRevision: number,
  toRevision: number
): CatalogueMigration | undefined {
  if (compatibility.classification === 'forbidden') {
    throw new CatalogueApiError(
      409,
      'catalogue_change_forbidden',
      'The draft contains a forbidden published-identity change',
      {
        issues: compatibility.changes.map((change) =>
          issue(change.definitionId, '$', change.code, change.code)
        ),
      }
    );
  }
  const migration = migrationInput(input, fromRevision, toRevision);
  if (compatibility.classification === 'migration_required' && migration === undefined) {
    throw new CatalogueApiError(
      409,
      'catalogue_migration_required',
      'Publication requires a named value migration',
      {
        issues: compatibility.changes.map((change) =>
          issue(change.definitionId, '$', change.code, change.code)
        ),
      }
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

/** Publishes a draft atomically, including dry-run migration and search rebuild. */
export function publishCatalogueDraft(
  db: CommandDb,
  revision: number,
  input: CataloguePublicationInput,
  author: CatalogueAuthor
): CatalogueDescriptor {
  const descriptor = db.transaction((tx) => {
    claimCurrentDraft(tx, revision, input.baseRevision, input.expectedDraftVersion);
    if (input.minimumProtocol !== undefined) {
      tx.update(catalogueRevisions)
        .set({ minimumProtocol: input.minimumProtocol })
        .where(eq(catalogueRevisions.revision, revision))
        .run();
    }
    const { base, candidate, compatibility } = publicationCompatibility(tx, revision, input);
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
