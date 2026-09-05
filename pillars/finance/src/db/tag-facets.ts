/**
 * The tag taxonomy: which namespaces exist, who is allowed to mint a value in
 * each, and how many values a transaction may carry on each axis.
 *
 * Since the 2026-08-28 namespace migration (POPS-2611) every stored tag is
 * `facet:value`. Two independent properties describe a facet, and conflating
 * them is what this module exists to prevent:
 *
 * **Kind** — who may mint a value on the axis (POPS-2606):
 *
 * - `closed` — a fixed set. Nobody mints; a value outside the set is a
 *   validation error, not a suggestion.
 * - `open` — a human, or another pillar, adds a value deliberately.
 * - `marker` — the system writes it from provenance (an enrichment provider,
 *   a person link, a review flag).
 *
 * **Classified** — whether the categorizer fills the axis in, listed in
 * {@link CLASSIFIED_TAG_FACETS}. The model always chooses from the values the
 * prompt lists, whoever minted them, so a classified axis may still be open:
 * `contains:` is exactly that. Its values are what a purchase contained, and
 * that is an open-ended question a human meets a new answer to on almost every
 * import ("contains:sunscreen"), while the categorizer still classifies every
 * row against whatever the vocabulary currently holds. Making it `closed`
 * meant a human could not name a new one without a migration; making it
 * unclassified would have cost the axis its coverage. The other four stay
 * closed because their value sets are the buckets the reports group by, and a
 * sixth venue invented mid-import is a bucket nothing else counts.
 *
 * This module owns the *rules*; `tag_vocabulary` owns the *values*. It
 * deliberately carries no list of classified values: that list lives in the
 * table and is read from it, so there is nothing here to drift out of step
 * with the database.
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
  contains: 'open',
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
 * The facets the categorizer classifies into, in the order they are presented
 * to the model, each with its cardinality.
 *
 * Membership here is independent of {@link TAG_FACET_KINDS}: `contains` is an
 * open facet and is still classified. `single: true` is a rule about the world, not a presentation hint — a
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
 *
 * Two `occasion:` decisions are worth stating, because both look redundant and
 * neither is (POPS-2607):
 *
 * - `occasion:travel` stays, even though `trip:*` also implies travel. The
 *   implication runs one way only. `trip` is an *open* facet, so a value exists
 *   only when someone deliberately creates one — derive travel from it and you
 *   lose the airport coffee, the work flight, and the weekend nobody bothered
 *   naming, which are exactly the ones that never get a trip. Making a value on
 *   the closed always-present axis conditional on a sparse open one would cost
 *   that axis the property it exists for: being exhaustively groupable. A row
 *   with both keeps `occasion:travel`; "spend eating out" is answered by
 *   `venue:` and `contains:` regardless of occasion.
 * - `occasion:admin` was retired (migration 0071). It restated what `type`
 *   already says, and `type` is set by the importer from the descriptor on every
 *   import with nobody in the loop, where the tag needed a human to remember
 *   forever — and had already been forgotten on 21 of the 38 rows it covered.
 *   `occasion:` now applies to spend and is silent elsewhere, so a missing
 *   occasion on a spend row always means "not yet decided".
 *
 * `contains:fee` was retired on the same reasoning (migration 0073,
 * POPS-2632): `contains:` says what a purchase contained, and since POPS-2610
 * a fee is not a purchase — it has its own `type` and a `fee:` value naming
 * which fee it is. The rows the classifier could not type keep the tag and
 * carry `flag:needs-review`, because there the tag is the only evidence left.
 */
/**
 * Marks a row a human still owes a decision on.
 *
 * Written by a retirement migration when it meets a row it cannot resolve
 * automatically. Both retirements so far flag such a row; only one of them
 * leaves the retired tag on it, and the difference is what coverage turns on:
 *
 * - **0073** flags AND strands. A `contains:fee` row with no `fee:` value is a
 *   descriptor the classifier does not recognise, and the tag is the only
 *   surviving evidence of what the row is, so the strip is guarded to skip it.
 * - **0071** flags and strips. `occasion:admin` said what `type` already says,
 *   so the row loses nothing by having it removed — the flag records that the
 *   row's `type` is the thing to fix.
 *
 * Coverage reads the flag for the first case: a flagged row's stranded tag is
 * already-tracked work, so counting it again as a gate failure would report one
 * debt twice (POPS-2683). A future retirement that strands has to flag, or its
 * rows become gate failures nothing accounts for.
 */
export const NEEDS_REVIEW_TAG = 'flag:needs-review';

export const CLASSIFIED_TAG_FACETS = [
  { facet: 'venue', single: true },
  { facet: 'occasion', single: true },
  { facet: 'contains', single: false },
  { facet: 'channel', single: true },
  { facet: 'fee', single: false },
] as const satisfies readonly { facet: keyof typeof TAG_FACET_KINDS; single: boolean }[];

/** A classified facet — the only facets the categorizer may write into. */
export type ClassifiedTagFacet = (typeof CLASSIFIED_TAG_FACETS)[number]['facet'];

const CLASSIFIED_FACET_SET = new Set<string>(CLASSIFIED_TAG_FACETS.map((f) => f.facet));

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

/**
 * The taxonomy as a list, for the surfaces that have to show it.
 *
 * Derived from {@link TAG_FACET_KINDS} rather than written out again, so a
 * facet added there reaches the pickers without a second edit. Declaration
 * order is the presentation order — the map groups the closed axes first, and
 * a picker that renders this list gets that grouping for free.
 */
export const TAG_FACETS: readonly { facet: string; kind: TagFacetKind }[] = Object.entries(
  TAG_FACET_KINDS
).map(([facet, kind]) => ({ facet, kind }));

/** The kind of a facet name, defaulting per {@link DEFAULT_TAG_FACET_KIND}. */
export function tagFacetKind(facet: string | null): TagFacetKind {
  if (facet === null) return DEFAULT_TAG_FACET_KIND;
  return (
    (TAG_FACET_KINDS as Record<string, TagFacetKind | undefined>)[facet] ?? DEFAULT_TAG_FACET_KIND
  );
}

/** True when `facet` is one the categorizer may classify into. */
export function isClassifiedTagFacet(facet: string | null): facet is ClassifiedTagFacet {
  return facet !== null && CLASSIFIED_FACET_SET.has(facet);
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

/**
 * Would adding `tag` put a second value on a single-valued facet of `existing`?
 *
 * The predicate every additive tag write needs, because additive is exactly
 * the operation `single: true` does not survive: merging cannot overwrite, so
 * without this it stores both values and the axis stops being groupable. A tag
 * already present, or one on a multi-valued or open facet, is never a conflict.
 */
export function exceedsFacetCardinality(existing: readonly string[], tag: string): boolean {
  if (existing.includes(tag)) return false;
  const { facet } = parseTagFacet(tag);
  const spec = CLASSIFIED_TAG_FACETS.find((entry) => entry.facet === facet);
  if (spec?.single !== true) return false;
  return existing.some((present) => parseTagFacet(present).facet === facet);
}

/** The outcome of {@link mergeTagsWithinFacetLimits}. */
export interface TagMergeResult {
  /** `existing` in its original order, followed by the incoming tags that joined. */
  tags: string[];
  /** Incoming tags refused because the facet already holds its one allowed value. */
  dropped: string[];
}

/**
 * `existing` plus every tag of `incoming` that can join it.
 *
 * The one merge rule for additive tag writes, in one place. A tag already
 * present is a no-op; a tag that would be a second value on a single-valued
 * facet is refused and reported in `dropped` rather than silently stored,
 * because storing both is precisely what `single: true` cannot survive — the
 * axis stops being groupable and nothing downstream can tell which value was
 * meant.
 *
 * **Incumbency wins.** When the facet is already occupied, the value that is
 * there stays and the incoming one is dropped. The caller is performing an
 * *add*, which asserts that a tag belongs — never that an existing one does
 * not. Replacing a tag is a different act, and callers who mean it have an
 * explicit edit path for it.
 *
 * The order of `existing` is preserved so a merge never reshuffles a list a
 * user arranged.
 */
export function mergeTagsWithinFacetLimits(
  existing: readonly string[],
  incoming: readonly string[]
): TagMergeResult {
  const tags = [...existing];
  const dropped: string[] = [];
  for (const tag of incoming) {
    if (tags.includes(tag)) continue;
    if (exceedsFacetCardinality(tags, tag)) {
      dropped.push(tag);
      continue;
    }
    tags.push(tag);
  }
  return { tags, dropped };
}
