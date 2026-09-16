/**
 * The refusal every replacing tag write raises when the set it would store puts
 * two values on a single-valued facet (POPS-3668).
 *
 * Additive writes (rules, corrections, retroactive apply) keep the incumbent via
 * `mergeTagsWithinFacetLimits`. A replacing write — a transaction create, a
 * PATCH carrying `tags`, an import commit row — has no incumbent, so it is
 * refused instead of silently picking a winner.
 */
import { findFacetCardinalityConflict } from './tag-facets.js';

/** A write whose tag set carries more than one value on a single-valued facet. */
export class FacetCardinalityError extends Error {
  override readonly name = 'FacetCardinalityError' as const;
  readonly facet: string;
  /** The conflicting values on `facet`, in the order given. */
  readonly tags: readonly string[];

  constructor(facet: string, tags: readonly string[]) {
    super(
      `A transaction may carry only one '${facet}' tag, but this write has ${tags.length}: ` +
        `${tags.join(', ')}. Keep one and remove the rest`
    );
    this.facet = facet;
    this.tags = tags;
  }
}

/** Throw {@link FacetCardinalityError} when `tags` exceeds a single-valued facet's cardinality. */
export function assertTagsWithinFacetCardinality(tags: readonly string[]): void {
  const conflict = findFacetCardinalityConflict(tags);
  if (conflict) throw new FacetCardinalityError(conflict.facet, conflict.tags);
}
