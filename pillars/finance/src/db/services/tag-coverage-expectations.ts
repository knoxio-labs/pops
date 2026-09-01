/**
 * The taxonomy rules behind the coverage metric: which facets a row is
 * *expected* to carry, and which classes of row sit outside a facet's
 * denominator entirely.
 *
 * Split out of `tag-coverage.ts` so that module stays what its own docstring
 * claims — a thing that only counts. Everything here is a judgement about the
 * world (a toll has no occasion, a corner shop cannot say what it sold); the
 * counting module applies these and adds nothing of its own.
 */
import { isSpendType } from '../../contract/corrections-constants.js';
import {
  CLASSIFIED_TAG_FACETS,
  TAG_FACET_SEPARATOR,
  type ClassifiedTagFacet,
} from '../tag-facets.js';

/** Marks a row whose contents the merchant does not determine (Amazon, IKEA). */
const ENRICH_PREFIX = `enrich${TAG_FACET_SEPARATOR}`;

/**
 * `contains:` values that mean "getting somewhere", not "a thing consumed".
 *
 * Such a row has no occasion of its own — the occasion is whatever you
 * travelled to, and it is recorded on that transaction, not on the fare
 * (POPS-2607). Requiring one here would force a guess onto every future import.
 *
 * The list is what the ledger says rather than what the words suggest, which is
 * why `rideshare` and `flight` are absent despite obviously being travel: all
 * 18 rideshare rows and both flight rows already carry an occasion, while
 * public-transport (0 of 21), tolls (0 of 12), parking (0 of 10) and fuel
 * (0 of 1) never do. `charging` is the one that splits, 9 of 22 — it is here
 * because those nine are a car being charged mid-trip and the rest are it being
 * charged at home, which is a distinction the descriptor cannot make.
 *
 * The exclusion is unconditional: a transit row is out of the occasion metric
 * whether or not it happens to carry one. Excluding only the rows that lack an
 * occasion would make the ratio flattering by construction — every row would be
 * either covered or excluded, and the number would report 100% while saying
 * nothing. Nothing here forbids an occasion on a transit row; the nine `AMPOL`
 * rows that carry `occasion:travel` keep it and simply do not figure in the
 * denominator.
 */
const TRANSIT_CONTAINS: readonly string[] = [
  `contains${TAG_FACET_SEPARATOR}public-transport`,
  `contains${TAG_FACET_SEPARATOR}tolls`,
  `contains${TAG_FACET_SEPARATOR}parking`,
  `contains${TAG_FACET_SEPARATOR}fuel`,
  `contains${TAG_FACET_SEPARATOR}charging`,
];

/**
 * `venue:` values whose row cannot say what it contained (POPS-2681).
 *
 * A corner shop or a servo kiosk sells drinks, snacks, phone chargers and
 * lottery tickets from the same counter, and the descriptor is the merchant
 * name and nothing else. A $4.06 line at `METRO PETROLEUM` is not an
 * un-triaged row waiting for someone to look at it — twelve of them were
 * looked at, and the answer was that the data does not contain the answer.
 * Supplying `contains:groceries` across them to move a percentage would record
 * twelve guesses as facts, which is the failure this axis exists to prevent.
 *
 * This is provisional in a way {@link TRANSIT_CONTAINS} is not. A transit row
 * has no occasion of its own and never will; a convenience-store row has real
 * contents that the *bank feed* cannot see. Line-item receipt capture would
 * supply them, and on the day it does this exclusion should be deleted rather
 * than grown.
 */
const CONTENTS_UNKNOWABLE_VENUES: readonly string[] = [
  `venue${TAG_FACET_SEPARATOR}convenience-store`,
];

/** Why a row sat outside a facet's addressable set. */
export type FacetExclusionReason = 'transit' | 'unknowable-contents';

/**
 * A rule putting a class of row outside one facet's denominator.
 *
 * Every such rule is unconditional — it excludes a matching row whether or not
 * that row happens to carry a value on the facet. Excluding only the rows that
 * lack one would make the ratio flattering by construction: every row would be
 * either covered or excluded, and the metric would report 100% while saying
 * nothing.
 */
export interface FacetExclusion {
  reason: FacetExclusionReason;
  excludes(tags: string[]): boolean;
}

const TRANSIT_EXCLUSION: FacetExclusion = {
  reason: 'transit',
  excludes: (tags) => tags.some((tag) => TRANSIT_CONTAINS.includes(tag)),
};

const UNKNOWABLE_CONTENTS_EXCLUSION: FacetExclusion = {
  reason: 'unknowable-contents',
  excludes: (tags) => tags.some((tag) => CONTENTS_UNKNOWABLE_VENUES.includes(tag)),
};

/**
 * The exclusions each facet carries. A facet absent from this map has none,
 * and is measured over every spend row without an `enrich:` marker.
 */
const EXCLUSIONS_BY_FACET: Partial<Record<ClassifiedTagFacet, readonly FacetExclusion[]>> = {
  occasion: [TRANSIT_EXCLUSION],
  contains: [UNKNOWABLE_CONTENTS_EXCLUSION],
};

/**
 * Which rows a facet is expected on.
 *
 * `enrich:` excludes everywhere: the row is explicitly waiting on an enrichment
 * provider to say what it contains, and asserting a facet over it now would be
 * a guess recorded as a fact.
 *
 * `spendOnly` carries the applicability rule above. It is true for the three
 * facets POPS-2607 requires and false for `channel:`/`fee:`, which are measured
 * over the whole ledger because a fee's kind is precisely what a non-spend row
 * has to say.
 */
export interface FacetExpectation {
  facet: ClassifiedTagFacet;
  /** Whether POPS-2607's acceptance criteria require this facet to be present. */
  required: boolean;
  /** Whether the facet applies only to rows whose `type` counts as spend. */
  spendOnly: boolean;
  /** Facet-specific rules putting a class of row outside its denominator. */
  exclusions: readonly FacetExclusion[];
}

/**
 * The facets a spend row is required to carry.
 *
 * `venue` is measured but NOT required (POPS-2607). A great deal of spend
 * happens at no place at all — a toll, a subscription, an online service, a
 * payment processor — and there is no honest venue value for those. The two
 * ways to make the axis total were both worse: inventing `venue:online` would
 * restate what `channel:online` already says, which is the redundancy the
 * `occasion:admin` retirement had just deleted, and gating `venue` on
 * `channel` would need `channel` populated first, which it is not. So `venue`
 * is a partial axis, deliberately, and the count below says how partial.
 */
const REQUIRED_FACETS = new Set<string>(['occasion', 'contains']);

/**
 * The facets that describe money spent ON something, so cannot apply to a
 * transfer or a fee. Wider than {@link REQUIRED_FACETS}: `venue` is not
 * required, but where it is absent that is still only meaningful for spend.
 */
const SPEND_ONLY_FACETS = new Set<string>(['venue', 'occasion', 'contains']);

export const FACET_EXPECTATIONS: readonly FacetExpectation[] = CLASSIFIED_TAG_FACETS.map(
  (closed) => ({
    facet: closed.facet,
    required: REQUIRED_FACETS.has(closed.facet),
    spendOnly: SPEND_ONLY_FACETS.has(closed.facet),
    exclusions: EXCLUSIONS_BY_FACET[closed.facet] ?? [],
  })
);

/** True when `enrich:` marks the row as waiting on an enrichment provider. */
export function isEnrichBlocked(tags: string[]): boolean {
  return tags.some((tag) => tag.startsWith(ENRICH_PREFIX));
}

/** The facet's own rule that puts this row outside its set, if any. */
export function findExclusion(
  expectation: FacetExpectation,
  tags: string[]
): FacetExclusion | undefined {
  return expectation.exclusions.find((exclusion) => exclusion.excludes(tags));
}

/** Is `facet` expected on this row, or outside its addressable set? */
export function isAddressable(
  expectation: FacetExpectation,
  row: { type: string; tags: string[] }
): boolean {
  if (isEnrichBlocked(row.tags)) return false;
  if (expectation.spendOnly && !isSpendType(row.type)) return false;
  return findExclusion(expectation, row.tags) === undefined;
}
