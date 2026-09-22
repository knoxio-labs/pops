import {
  collectCatalogueChanges,
  highestCompatibilityClassification,
} from './compatibility-changes.js';

import type { PersistedCatalogue } from './catalogue-types.js';
import type { CatalogueCompatibilityResult } from './compatibility-types.js';

export type {
  CatalogueCompatibilityChange,
  CatalogueCompatibilityClassification,
  CatalogueCompatibilityResult,
} from './compatibility-types.js';

/**
 * Classifies a complete candidate snapshot against its published base.
 * Published identities are immutable; replacements use new ids plus an
 * explicit migration rather than mutating the old definition in place.
 */
export function classifyCatalogueCompatibility(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue
): CatalogueCompatibilityResult {
  const changes = collectCatalogueChanges(base, candidate);
  return {
    classification: highestCompatibilityClassification(changes),
    affectedIds: [...new Set(changes.map((change) => change.definitionId))].toSorted(),
    changes,
  };
}
