/**
 * The tag taxonomy: which namespaces exist, who is allowed to mint a value in
 * each, and how many values a transaction may carry on each axis.
 *
 * Since the 2026-08-28 namespace migration (POPS-2611) every stored tag is
 * `facet:value`. The facet's *kind* decides who may create a value on that
 * axis (POPS-2606):
 *
 * - `closed` — a fixed set. Nobody mints; the categorizer classifies into it,
 *   and a value outside the set is a validation error, not a suggestion.
 * - `open` — a human, or another pillar, adds a value deliberately.
 * - `marker` — the system writes it from provenance (an enrichment provider,
 *   a person link, a review flag).
 *
 * This module owns the *rules*; `tag_vocabulary` owns the *values*. It
 * deliberately carries no list of closed values: that list lives in the table
 * and is read from it, so there is nothing here to drift out of step with the
 * database.
 */

/** Who is permitted to mint a value on a facet. */
export type TagFacetKind = 'closed' | 'open' | 'marker';

/** The `facet:value` separator. */
export const TAG_FACET_SEPARATOR = ':';

/**
 * Every facet the vocabulary recognises, mapped to its kind. A tag whose
 * prefix is absent from this map is treated as {@link DEFAULT_TAG_FACET_KIND}
 * — see {@link tagFacetKind}.
 */
export const TAG_FACET_KINDS = {
  venue: 'closed',
  occasion: 'closed',
  contains: 'closed',
  channel: 'closed',
  fee: 'closed',
  trip: 'open',
  asset: 'open',
  project: 'open',
  hobby: 'open',
  tax: 'open',
  enrich: 'marker',
  person: 'marker',
  flag: 'marker',
} as const satisfies Record<string, TagFacetKind>;

/**
 * The kind assumed for a tag with no facet prefix or an unrecognised one.
 * `open` rather than `closed`: such a tag can only have come from a human or
 * a pre-migration row, and calling it closed would put it in front of the
 * categorizer as a value to classify into.
 */
export const DEFAULT_TAG_FACET_KIND: TagFacetKind = 'open';

/**
 * The closed facets, in the order they are presented to the model, each with
 * its cardinality.
 *
 * `single: true` is a rule about the world, not a presentation hint — a
 * transaction happens on one occasion and through one channel. `contains` and
 * `fee` are genuinely multi-valued. The order is fixed so a prompt diff is a
 * real change rather than a key-iteration accident.
 *
 * `venue` is single-valued, deliberately, and it is the one that could have
 * gone either way: real venues blur, and nine stored transactions carry two
 * (`venue:restaurant + venue:bar`, `venue:bar + venue:pub`). Those rows are why
 * this cardinality is enforced only on the write path — see the note below —
 * but the axis itself has to be single, because the question it exists to
 * answer is "how much at bars and pubs versus restaurants" and a row in two
 * buckets is counted twice in an expenditure sum. A meal at a gastropub is one
 * venue plus `contains:food`, not two venues.
 *
 * The cardinality binds what may be *written* — a model response carrying two
 * values on a single-valued facet is rejected. It is not a constraint over
 * stored rows: the existing violations are POPS-2607's cleanup, and a
 * migration-time constraint would refuse to open the database until then.
 */
export const CLOSED_TAG_FACETS = [
  { facet: 'venue', single: true },
  { facet: 'occasion', single: true },
  { facet: 'contains', single: false },
  { facet: 'channel', single: true },
  { facet: 'fee', single: false },
] as const satisfies readonly { facet: keyof typeof TAG_FACET_KINDS; single: boolean }[];

/** A closed facet — the only facets the categorizer may write into. */
export type ClosedTagFacet = (typeof CLOSED_TAG_FACETS)[number]['facet'];

const CLOSED_FACET_SET = new Set<string>(CLOSED_TAG_FACETS.map((f) => f.facet));

/**
 * Split a stored tag into its facet and value. Only the first separator
 * divides it, so a value may itself contain a colon. A tag with no separator,
 * an empty facet, or an empty value has no facet and keeps its whole string as
 * the value — a legacy or hand-typed tag must still be storable.
 */
export function parseTagFacet(tag: string): { facet: string | null; value: string } {
  const index = tag.indexOf(TAG_FACET_SEPARATOR);
  if (index <= 0) return { facet: null, value: tag };
  const value = tag.slice(index + 1);
  if (value === '') return { facet: null, value: tag };
  return { facet: tag.slice(0, index), value };
}

/** The kind of a facet name, defaulting per {@link DEFAULT_TAG_FACET_KIND}. */
export function tagFacetKind(facet: string | null): TagFacetKind {
  if (facet === null) return DEFAULT_TAG_FACET_KIND;
  return (
    (TAG_FACET_KINDS as Record<string, TagFacetKind | undefined>)[facet] ?? DEFAULT_TAG_FACET_KIND
  );
}

/** True when `facet` is a closed facet the categorizer may classify into. */
export function isClosedTagFacet(facet: string | null): facet is ClosedTagFacet {
  return facet !== null && CLOSED_FACET_SET.has(facet);
}

/** Compose a stored tag from a facet and a value. */
export function formatTag(facet: string, value: string): string {
  return `${facet}${TAG_FACET_SEPARATOR}${value}`;
}

/**
 * Parse a JSON-encoded `tags` column back into a `string[]`, tolerating a
 * malformed or non-array payload by returning nothing.
 *
 * Reading has to be total: a row whose `tags` cannot be parsed is a row that
 * still has to be counted and listed, and throwing here would take an audit
 * down on the single row it most needs to report.
 */
export function parseStoredTags(tagsJson: string | null | undefined): string[] {
  if (!tagsJson) return [];
  try {
    const parsed: unknown = JSON.parse(tagsJson);
    return Array.isArray(parsed)
      ? parsed.filter((tag): tag is string => typeof tag === 'string')
      : [];
  } catch {
    return [];
  }
}
