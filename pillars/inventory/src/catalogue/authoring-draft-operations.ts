import { claimCurrentDraft } from './authoring-draft-version.js';
import { applyOperation } from './authoring-operations.js';
import { requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { validateCatalogue } from './authoring-validation.js';
import { toCatalogueDescriptor } from './authoring-wire.js';
import {
  assessCatalogueCompatibility,
  countCompatibilityAffectedItems,
} from './compatibility-preview.js';

import type { CommandDb } from '../domain/commands/index.js';
import type {
  CatalogueDescriptor,
  CatalogueIssue,
  CataloguePreviewDiagnostics,
  DraftOperation,
} from './authoring-types.js';
import type { CatalogueCompatibilityAssessment } from './compatibility-preview.js';

export interface DraftOperationResult {
  readonly draft: CatalogueDescriptor;
  readonly compatibility: CatalogueCompatibilityAssessment;
}

/** Identifies the draft an operation batch targets and the version the caller last read. */
export interface DraftTarget {
  readonly revision: number;
  readonly baseRevision: number;
  readonly expectedDraftVersion: number;
}

/** Applies and validates one operation batch inside the caller's transaction. */
export function applyDraftOperations(
  db: CommandDb,
  target: DraftTarget,
  operations: readonly DraftOperation[]
): DraftOperationResult {
  const { revision, baseRevision, expectedDraftVersion } = target;
  claimCurrentDraft(db, revision, baseRevision, expectedDraftVersion);
  for (const operation of operations) applyOperation(db, revision, operation);
  const draft = requireCatalogue(db, revision, ['draft']);
  const base = requireCatalogue(db, baseRevision, ['published']);
  const previewCompatibility = assessCatalogueCompatibility(db, base, draft);
  try {
    validateCatalogue(draft);
  } catch (error) {
    if (error instanceof CatalogueApiError) {
      throw new CatalogueApiError(error.status, error.code, error.message, {
        issues: error.issues,
        preview: {
          baseRevision,
          draftRevision: revision,
          compatibility: previewCompatibility,
        },
      });
    }
    throw error;
  }
  return {
    draft: toCatalogueDescriptor(db, draft),
    compatibility: previewCompatibility,
  };
}

class PreviewRollback extends Error {
  constructor(readonly result: DraftOperationResult) {
    super('Rollback non-mutating catalogue preview');
  }
}

function rejectedOperationCompatibility(
  db: CommandDb,
  target: DraftTarget,
  issues: readonly CatalogueIssue[]
): CatalogueCompatibilityAssessment {
  const base = requireCatalogue(db, target.baseRevision, ['published']);
  const draft = requireCatalogue(db, target.revision, ['draft']);
  const changes = issues.flatMap((catalogueIssue) =>
    catalogueIssue.definitionId === null
      ? []
      : [
          {
            classification: 'forbidden' as const,
            definitionId: catalogueIssue.definitionId,
            code: catalogueIssue.code,
          },
        ]
  );
  const affectedIds = [...new Set(changes.map((change) => change.definitionId))];
  return {
    classification: 'forbidden',
    affectedIds,
    affectedItems: countCompatibilityAffectedItems(db, base, draft, affectedIds),
    discardedOverrides: [],
    changes,
  };
}

/** Validates operations and computes compatibility while rolling back every draft write. */
export function previewCatalogueDraft(
  db: CommandDb,
  target: DraftTarget,
  operations: readonly DraftOperation[]
): CataloguePreviewDiagnostics {
  const { revision, baseRevision } = target;
  try {
    db.transaction((tx) => {
      throw new PreviewRollback(applyDraftOperations(tx, target, operations));
    });
  } catch (error) {
    if (error instanceof PreviewRollback) {
      return {
        baseRevision,
        draftRevision: revision,
        compatibility: error.result.compatibility,
      };
    }
    if (
      error instanceof CatalogueApiError &&
      error.preview === undefined &&
      error.issues.length > 0
    ) {
      throw new CatalogueApiError(error.status, error.code, error.message, {
        issues: error.issues,
        preview: {
          baseRevision,
          draftRevision: revision,
          compatibility: rejectedOperationCompatibility(db, target, error.issues),
        },
      });
    }
    throw error;
  }
  throw new Error('Catalogue preview transaction completed without rolling back');
}
