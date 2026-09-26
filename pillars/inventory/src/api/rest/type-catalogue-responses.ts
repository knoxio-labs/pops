import { CatalogueApiError } from '../../catalogue/authoring.js';
import { inventoryError } from '../errors.js';

import type { patchCatalogueDraft } from '../../catalogue/authoring.js';
import type {
  CatalogueCompatibilityChange,
  CatalogueCompatibilityClassification,
} from '../../catalogue/compatibility-types.js';

/** JSON response shape for catalogue compatibility evidence. */
export interface CatalogueCompatibilityBody {
  classification: CatalogueCompatibilityClassification;
  affectedIds: string[];
  affectedItems: number;
  discardedOverrides: { fieldId: string; items: number }[];
  changes: CatalogueCompatibilityChange[];
}

/** Converts internal compatibility evidence to its mutable JSON response shape. */
export function compatibilityBody(
  result: Awaited<ReturnType<typeof patchCatalogueDraft>>['compatibility']
): CatalogueCompatibilityBody {
  return {
    classification: result.classification,
    affectedIds: [...result.affectedIds],
    affectedItems: result.affectedItems,
    discardedOverrides: result.discardedOverrides.map((entry) => ({ ...entry })),
    changes: result.changes.map((change) => ({ ...change })),
  };
}

/** Run catalogue work while leaving failures to the shared Express pipeline. */
export async function runCatalogue<T>(operation: () => T | Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (!(error instanceof CatalogueApiError)) throw error;
    const reason = error.code.startsWith('catalogue_')
      ? error.code.slice('catalogue_'.length)
      : error.code;
    throw inventoryError({
      area: 'catalogue',
      reason,
      status: error.status,
      message: error.message,
      details: {
        ...(error.currentDraftVersion === undefined
          ? {}
          : { currentDraftVersion: error.currentDraftVersion }),
        ...(error.issues.length === 0 ? {} : { issues: [...error.issues] }),
        ...(error.preview === undefined
          ? {}
          : {
              preview: {
                baseRevision: error.preview.baseRevision,
                draftRevision: error.preview.draftRevision,
                compatibility: compatibilityBody(error.preview.compatibility),
              },
            }),
      },
    });
  }
}
