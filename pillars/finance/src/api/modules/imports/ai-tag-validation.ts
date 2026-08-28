/**
 * Validation of the categorizer's tag output against the closed vocabulary
 * (POPS-2606).
 *
 * The model is asked to classify into closed namespaces, and this is the point
 * where "asked to" becomes "may only". Every value it returns is checked
 * against the vocabulary the prompt was built from; a value outside the closed
 * set for its facet is dropped, counted and logged, never stored. That is what
 * stops the vocabulary ratcheting: before this, a coined tag survived one
 * commit and became permanent vocabulary with the same standing as a
 * deliberate one.
 *
 * What is rejected, and why each case is separate:
 *
 * - a value not in its facet's closed set — the case the ticket exists for;
 * - a facet that is not closed at all, including every `open` facet and every
 *   `marker` one. A `enrich:`/`person:`/`flag:` value is invalid *regardless of
 *   whether the value exists*, because those are written by the system from
 *   provenance and a model asserting one is asserting provenance it cannot
 *   have;
 * - more than one value on a single-valued facet — cardinality is enforced
 *   here on the write path, not as a constraint over stored rows, which
 *   already hold violations (POPS-2607).
 */
import {
  CLOSED_TAG_FACETS,
  exceedsFacetCardinality,
  formatTag,
  isClosedTagFacet,
  parseTagFacet,
  tagFacetKind,
} from '../../../db/tag-facets.js';

/** Why a returned value was refused. */
export type TagRejectionReason =
  /** The facet is closed but does not hold this value. */
  | 'value-not-in-closed-set'
  /** The facet is `open` or `marker` — not the model's to write. */
  | 'facet-not-closed'
  /**
   * A second value on a facet that holds one. The first valid value is kept
   * and each later one is refused, so a reply of two occasions yields the
   * occasion the model reached for first rather than no occasion at all.
   */
  | 'exceeds-facet-cardinality';

/** One refused value, carried to the caller for counting and logging. */
export interface RejectedTagValue {
  /** The facet as returned, or null when the value carried no usable prefix. */
  facet: string | null;
  /** The value as returned, before any normalisation. */
  value: string;
  reason: TagRejectionReason;
}

export interface TagValidationResult {
  /** The surviving tags as stored strings, in closed-facet order. */
  tags: string[];
  rejected: RejectedTagValue[];
}

/** The per-facet fields a v2 categorizer reply carries, plus the legacy array. */
export interface RawTagFields {
  tags?: unknown;
  [facet: string]: unknown;
}

function asStringList(raw: unknown): string[] {
  if (typeof raw === 'string') return raw.trim() === '' ? [] : [raw];
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === 'string' && v !== '');
  return [];
}

/**
 * Index the closed vocabulary as `facet -> lowercased value -> stored tag`.
 *
 * Lowercasing only the lookup key means a reply of `Bar` resolves to the stored
 * `venue:bar` — forgiving about the form of an answer, unforgiving about
 * whether it is one of the available answers.
 */
function indexClosedVocabulary(knownTags: readonly string[]): Map<string, Map<string, string>> {
  const index = new Map<string, Map<string, string>>();
  for (const tag of knownTags) {
    const { facet, value } = parseTagFacet(tag);
    if (!isClosedTagFacet(facet)) continue;
    let byValue = index.get(facet);
    if (!byValue) {
      byValue = new Map<string, string>();
      index.set(facet, byValue);
    }
    byValue.set(value.toLowerCase(), tag);
  }
  return index;
}

/**
 * Strip a redundant facet prefix from a returned value.
 *
 * The model is asked for `bar` under a `venue` field but may answer
 * `venue:bar`. That is the same answer, so it resolves; a value prefixed with a
 * *different* facet is left intact and fails the set lookup, because
 * `contains:food` under `venue` is not a venue.
 */
function stripOwnFacetPrefix(facet: string, value: string): string {
  const parsed = parseTagFacet(value);
  return parsed.facet !== null && parsed.facet.toLowerCase() === facet ? parsed.value : value;
}

interface FacetPass {
  facet: string;
  single: boolean;
  raw: string[];
  index: Map<string, Map<string, string>>;
  tags: string[];
  rejected: RejectedTagValue[];
}

function validateFacetValues(pass: FacetPass): void {
  const { facet, single, raw, index, tags, rejected } = pass;
  const byValue = index.get(facet);
  let kept = 0;
  for (const value of raw) {
    const resolved = byValue?.get(stripOwnFacetPrefix(facet, value).toLowerCase());
    if (resolved === undefined) {
      rejected.push({ facet, value, reason: 'value-not-in-closed-set' });
      continue;
    }
    // Resolve before counting: a value repeated is one value said twice, not a
    // cardinality breach, and an unknown value must not consume the one slot a
    // single-valued facet has.
    if (tags.includes(resolved)) continue;
    if (single && kept > 0) {
      rejected.push({ facet, value, reason: 'exceeds-facet-cardinality' });
      continue;
    }
    tags.push(resolved);
    kept++;
  }
}

/**
 * Validate a categorizer reply's tag output against `knownTags` — the same
 * closed vocabulary the prompt was rendered from.
 *
 * Reads both the per-facet fields of a v2 reply (`{"venue": "bar", "contains":
 * ["food"]}`) and the legacy flat `tags` array, so a model that ignores the new
 * shape is validated rather than trusted. Everything that survives is returned
 * as a stored `facet:value` string in closed-facet order; everything that does
 * not is returned in `rejected` for the caller to count and log.
 */
export function validateAiTags(
  fields: RawTagFields,
  knownTags: readonly string[]
): TagValidationResult {
  const index = indexClosedVocabulary(knownTags);
  const tags: string[] = [];
  const rejected: RejectedTagValue[] = [];

  for (const { facet, single } of CLOSED_TAG_FACETS) {
    validateFacetValues({ facet, single, raw: asStringList(fields[facet]), index, tags, rejected });
  }

  for (const entry of asStringList(fields.tags)) {
    const { facet, value } = parseTagFacet(entry);
    if (!isClosedTagFacet(facet)) {
      rejected.push({ facet, value, reason: 'facet-not-closed' });
      continue;
    }
    const resolved = index.get(facet)?.get(value.toLowerCase());
    if (resolved === undefined) {
      rejected.push({ facet, value, reason: 'value-not-in-closed-set' });
      continue;
    }
    if (tags.includes(resolved)) continue;
    if (exceedsFacetCardinality(tags, resolved)) {
      rejected.push({ facet, value, reason: 'exceeds-facet-cardinality' });
      continue;
    }
    tags.push(resolved);
  }

  return { tags, rejected };
}

/**
 * Log the refused values for one reply.
 *
 * Logged rather than swallowed because a value the model keeps reaching for is
 * evidence the closed vocabulary is missing something — which is a human
 * decision, and can only be made from a record of what was asked for. The
 * merchant description is deliberately absent: this line carries the model's
 * vocabulary, not the transaction.
 */
export function logRejectedTagValues(rejected: readonly RejectedTagValue[]): void {
  for (const { facet, value, reason } of rejected) {
    const subject = facet === null ? value : formatTag(facet, value);
    const kindNote = facet === null ? '' : ` (${facet} is ${tagFacetKind(facet)})`;
    console.warn(`[AI] rejected tag value ${JSON.stringify(subject)}: ${reason}${kindNote}`);
  }
}
