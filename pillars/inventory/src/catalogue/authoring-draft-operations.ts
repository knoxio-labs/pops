import { claimCurrentDraft } from './authoring-draft-version.js';
import { applyOperation } from './authoring-operations.js';
import { requireCatalogue } from './authoring-shared.js';
import { CatalogueApiError } from './authoring-types.js';
import { validateCatalogue } from './authoring-validation.js';
import { toCatalogueDescriptor } from './authoring-wire.js';
import { countCompatibilityAffectedItems } from './compatibility-preview.js';
import { classifyCatalogueCompatibility } from './compatibility.js';

import type { CommandDb } from '../domain/commands/index.js';
import type {
  CatalogueDescriptor,
  CataloguePreviewDiagnostics,
  DraftOperation,
} from './authoring-types.js';
import type { CatalogueCompatibilityResult } from './compatibility.js';

export interface DraftOperationResult {
  readonly draft: CatalogueDescriptor;
  readonly compatibility: CatalogueCompatibilityResult & { readonly affectedItems: number };
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
  const compatibility = classifyCatalogueCompatibility(base, draft);
  const previewCompatibility = {
    ...compatibility,
    affectedItems: countCompatibilityAffectedItems(db, base, draft, compatibility.affectedIds),
  };
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
      const base = requireCatalogue(db, baseRevision, ['published']);
      const draft = requireCatalogue(db, revision, ['draft']);
      const affectedIds = [
        ...new Set(
          error.issues.flatMap((catalogueIssue) =>
            catalogueIssue.definitionId === null ? [] : [catalogueIssue.definitionId]
          )
        ),
      ];
      throw new CatalogueApiError(error.status, error.code, error.message, {
        issues: error.issues,
        preview: {
          baseRevision,
          draftRevision: revision,
          compatibility: {
            classification: 'forbidden',
            affectedIds,
            affectedItems: countCompatibilityAffectedItems(db, base, draft, affectedIds),
            changes: error.issues.flatMap((catalogueIssue) =>
              catalogueIssue.definitionId === null
                ? []
                : [
                    {
                      classification: 'forbidden' as const,
                      definitionId: catalogueIssue.definitionId,
                      code: catalogueIssue.code,
                    },
                  ]
            ),
          },
        },
      });
    }
    throw error;
  }
  throw new Error('Catalogue preview transaction completed without rolling back');
}
