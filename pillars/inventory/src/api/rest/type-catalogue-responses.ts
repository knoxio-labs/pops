import { CatalogueApiError } from '../../catalogue/authoring.js';

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
  changes: CatalogueCompatibilityChange[];
}

type CatalogueFailure = {
  status: 400 | 401 | 404 | 409;
  body: {
    message: string;
    code: string;
    issues?: {
      definitionId: string | null;
      path: string;
      code: string;
      message: string;
    }[];
    preview?: {
      baseRevision: number;
      draftRevision: number;
      compatibility: ReturnType<typeof compatibilityBody>;
    };
  };
};

/** Converts internal compatibility evidence to its mutable JSON response shape. */
export function compatibilityBody(
  result: Awaited<ReturnType<typeof patchCatalogueDraft>>['compatibility']
): CatalogueCompatibilityBody {
  return {
    classification: result.classification,
    affectedIds: [...result.affectedIds],
    affectedItems: result.affectedItems,
    changes: result.changes.map((change) => ({ ...change })),
  };
}

function failure(error: CatalogueApiError): CatalogueFailure {
  return {
    status: error.status,
    body: {
      message: error.message,
      code: error.code,
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
  };
}

/** Maps catalogue API failures while preserving successful handler result types. */
export async function runCatalogue<T>(
  operation: () => T | Promise<T>
): Promise<T | CatalogueFailure> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof CatalogueApiError) return failure(error);
    throw error;
  }
}
