/**
 * The one way an additive tag backfill can leave a row worse than it found it.
 *
 * `applyTagRuleToExistingTransactions` merges a rule's tags into every row it
 * matches without consulting `CLOSED_TAG_FACETS`, so a rule asserting
 * `venue:supermarket` over a row already carrying `venue:cafe` writes both —
 * re-creating exactly the stored cardinality violations 0076 was written to
 * clear, and doing it silently, since the retroactive result reports a count
 * and not what it merged.
 *
 * Kept out of `backfill-tag-rules.ts` so it can be tested without importing a
 * module whose last line runs the backfill.
 */
import { describeForMatching, patternMatchesDescription } from '../src/contract/pattern-match.js';
import { CLOSED_TAG_FACETS, parseStoredTags, parseTagFacet } from '../src/db/tag-facets.js';

const SINGLE_VALUED_FACETS = new Set<string>(
  CLOSED_TAG_FACETS.filter((facet) => facet.single).map((facet) => facet.facet)
);

/** A rule as the backfill plans it, narrowed to what a conflict scan needs. */
export interface ScannedRule {
  pattern: string;
  tags: readonly string[];
}

/** A transaction as the backfill reads it, narrowed likewise. */
export interface ScannedTransaction {
  description: string;
  /** The raw JSON-encoded `tags` column. */
  tags: string;
}

/** One row a rule would push onto a second value of a single-valued facet. */
export interface TagRuleConflict {
  pattern: string;
  description: string;
  /** The value the rule would add. */
  incoming: string;
  /** The value on the same facet the row already carries. */
  existing: string;
}

function singleValuedTagsOf(rule: ScannedRule): { tag: string; facet: string }[] {
  const tagged = rule.tags.map((tag) => ({ tag, facet: parseTagFacet(tag).facet }));
  return tagged.filter(
    (entry): entry is { tag: string; facet: string } =>
      entry.facet !== null && SINGLE_VALUED_FACETS.has(entry.facet)
  );
}

function conflictsOnRow(
  rule: ScannedRule,
  incoming: { tag: string; facet: string },
  row: ScannedTransaction
): TagRuleConflict[] {
  return parseStoredTags(row.tags)
    .filter((existing) => existing !== incoming.tag)
    .filter((existing) => parseTagFacet(existing).facet === incoming.facet)
    .map((existing) => ({
      pattern: rule.pattern,
      description: row.description,
      incoming: incoming.tag,
      existing,
    }));
}

/**
 * Every (rule, row) pair where merging the rule would leave two values on one
 * single-valued facet. Matching goes through `patternMatchesDescription`, the
 * same call the retroactive applier makes, because a scan that matched more
 * narrowly than the applier would miss the rows it is there to catch.
 */
export function findTagRuleConflicts(
  rules: readonly ScannedRule[],
  rows: readonly ScannedTransaction[]
): TagRuleConflict[] {
  return rules.flatMap((rule) => {
    const incoming = singleValuedTagsOf(rule);
    if (incoming.length === 0) return [];

    return rows
      .filter((row) =>
        patternMatchesDescription(rule.pattern, 'contains', describeForMatching(row.description))
      )
      .flatMap((row) => incoming.flatMap((tag) => conflictsOnRow(rule, tag, row)));
  });
}
