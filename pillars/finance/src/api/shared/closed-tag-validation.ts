import { parseTagFacet, tagFacetKind } from '../../db/tag-facets.js';
import { ValidationError } from './errors.js';

import type { KnownTagSet } from '../../db/services/tag-vocabulary.js';

/**
 * Reject tags that name a value outside a closed facet's known vocabulary.
 *
 * Tags are trimmed before validation to match the vocabulary writers' storage
 * behavior. Existing known values and values on open or marker facets pass.
 */
export function assertKnownClosedTagValues(tags: readonly string[], known: KnownTagSet): void {
  for (const rawTag of tags) {
    const tag = rawTag.trim();
    if (tag === '' || known.has(tag)) continue;

    const { facet } = parseTagFacet(tag);
    if (tagFacetKind(facet) !== 'closed') continue;

    const closedFacet = facet ?? '';
    throw new ValidationError(
      `'${tag}' is not a value of the closed '${closedFacet}' namespace. ` +
        `Pick an existing ${closedFacet} value, or use an open namespace for a value you are creating.`,
      { tag, facet: closedFacet }
    );
  }
}
