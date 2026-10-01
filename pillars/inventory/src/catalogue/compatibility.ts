import {
  collectCatalogueChanges,
  highestCompatibilityClassification,
} from './compatibility-changes.js';
import { requiredVocabularyProtocol } from './compatibility-protocol.js';

import type { PersistedCatalogue } from './catalogue-types.js';
import type { CatalogueCompatibilityChange } from './compatibility-types.js';
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
 * `activeMinimumProtocol` downgrades protocol-gated changes already supported
 * by the active rollout; omitting it conservatively assumes protocol 1.
 */
export function classifyCatalogueCompatibility(
  base: PersistedCatalogue,
  candidate: PersistedCatalogue,
  fieldsHoldingOverrides: ReadonlySet<string> = new Set(),
  activeMinimumProtocol = 1
): CatalogueCompatibilityResult {
  const changes = collectCatalogueChanges(
    base,
    candidate,
    fieldsHoldingOverrides
  ).map<CatalogueCompatibilityChange>((change) => {
    if (change.classification !== 'protocol_gated') return change;

    const requiredProtocol =
      change.code === 'minimum_protocol_increased'
        ? candidate.revision.minimumProtocol
        : requiredVocabularyProtocol(change.code);

    return requiredProtocol !== undefined && activeMinimumProtocol >= requiredProtocol
      ? { ...change, classification: 'compatible' }
      : change;
  });
  return {
    classification: highestCompatibilityClassification(changes),
    affectedIds: [...new Set(changes.map((change) => change.definitionId))].toSorted(),
    changes,
  };
}
