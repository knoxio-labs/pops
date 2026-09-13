import { exceedsFacetCardinality } from '@pops/finance';

/**
 * `existing` with every tag of `incoming` applied, where an incoming tag on a
 * single-valued facet replaces the value already there rather than joining it.
 *
 * Every Tag Review merge is the user's latest action — accepting a suggestion,
 * applying a group tag, saving a rule — so the incoming value wins over the one
 * the row held. Within `incoming` the first value on a facet wins, because
 * suggestion lists arrive in priority order. Multi-valued and unfaceted tags
 * union as before. The cardinality rule itself is the pillar's
 * `exceedsFacetCardinality`, so this cannot build a set the commit refuses.
 */
export function mergeTagsReplacingSingleValued(
  existing: readonly string[],
  incoming: readonly string[]
): string[] {
  const applied: string[] = [];
  let tags = [...existing];
  for (const tag of incoming) {
    if (exceedsFacetCardinality(applied, tag)) continue;
    applied.push(tag);
    tags = tags.filter((present) => !exceedsFacetCardinality([present], tag));
    if (!tags.includes(tag)) tags.push(tag);
  }
  return tags;
}
