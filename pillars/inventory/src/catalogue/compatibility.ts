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
 * `fieldsHoldingOverrides` names computed fields on which a live item holds an
 * override (see `findFieldsHoldingOverrides`); omitting it classifies as if
 * no item held one, which only suits judging values that are revalidated.
 */
export function classifyCatalogueCompatibility(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  fieldsHoldingOverrides: ReadonlySet<string> = new Set()
): CatalogueCompatibilityResult {
  const changes = collectCatalogueChanges(base, candidate, fieldsHoldingOverrides);
  return {
    classification: highestCompatibilityClassification(changes),
    affectedIds: [...new Set(changes.map((change) => change.definitionId))].toSorted(),
    changes,
  };
}
