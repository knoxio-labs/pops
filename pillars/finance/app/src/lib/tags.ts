/**
 * Tag taxonomy presentation.
 *
 * Tags are stored as a flat `string[]` and, since the 2026-08-28 namespace
 * migration, each carries a `facet:value` prefix naming the axis it belongs
 * to (`venue:bar`, `contains:alcohol`). Storage is deliberately unchanged —
 * this module is the single place that splits that encoding apart for
 * display, so no surface has to know the wire format.
 */
import { hashToColor } from '@pops/ui';

/** A stored tag split into its taxonomy axis and the value on that axis. */
export interface ParsedTag {
  /** The axis (`venue`, `contains`, …), or `null` for an unprefixed tag. */
  facet: string | null;
  /** The value on that axis; the whole tag when there is no facet. */
  value: string;
  /** The stored string, unchanged. */
  raw: string;
}

/** A run of tags sharing one axis, as rendered under a single heading. */
export interface TagFacetGroup {
  facet: string | null;
  /** Display heading for the group. */
  label: string;
  tags: ParsedTag[];
}

const FACET_SEPARATOR = ':';

/** Heading for tags that carry no facet prefix. */
export const UNFACETED_LABEL = 'Other';

/**
 * Split `facet:value` into its parts.
 *
 * Only the first separator divides the tag, so a value may itself contain a
 * colon. A tag with no separator, an empty facet, or an empty value is
 * treated as unfaceted and keeps its whole string as the value — a legacy or
 * hand-typed tag must render, not throw.
 */
export function parseTag(raw: string): ParsedTag {
  const separatorIndex = raw.indexOf(FACET_SEPARATOR);
  if (separatorIndex <= 0) return { facet: null, value: raw, raw };
  const value = raw.slice(separatorIndex + 1);
  if (value === '') return { facet: null, value: raw, raw };
  return { facet: raw.slice(0, separatorIndex), value, raw };
}

/**
 * Sentence-case a slug for display: `party-supplies` → `Party supplies`.
 *
 * Deliberately mechanical. Mapping values onto friendlier names would create
 * a second vocabulary to keep in sync with the stored one.
 */
function sentenceCase(slug: string): string {
  const spaced = slug.replace(/[-_]+/g, ' ').trim();
  if (spaced === '') return '';
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

/** The chip text for a tag — its value, never the `facet:` prefix. */
export function formatTagValue(parsed: ParsedTag): string {
  return sentenceCase(parsed.value) || parsed.value;
}

/** The heading text for an axis. */
export function formatFacet(facet: string | null): string {
  return facet === null ? UNFACETED_LABEL : sentenceCase(facet) || facet;
}

/**
 * The string a tag's colour is derived from.
 *
 * Faceted tags colour by axis, so every `venue:*` chip shares a hue and the
 * axes stay distinguishable at a glance. Unfaceted tags fall back to their
 * own string.
 */
export function tagColorKey(parsed: ParsedTag): string {
  return parsed.facet ?? parsed.raw;
}

/** Everything a chip needs to render one tag. */
export interface TagPresentation {
  parsed: ParsedTag;
  /** Visible text. */
  label: string;
  /** Announced text, carrying the axis a sighted reader gets from colour. */
  ariaLabel: string;
  /** Tooltip; always ends with the stored string so it stays discoverable. */
  title: string;
  style: ReturnType<typeof hashToColor>;
}

/**
 * Describe a stored tag for display.
 *
 * `context` is prepended to the tooltip by callers that have extra
 * attribution to show (for example which rule suggested the tag).
 */
export function describeTag(raw: string, context?: string): TagPresentation {
  const parsed = parseTag(raw);
  const label = formatTagValue(parsed);
  const ariaLabel = parsed.facet === null ? label : `${formatFacet(parsed.facet)}: ${label}`;
  return {
    parsed,
    label,
    ariaLabel,
    title: context ? `${context} — ${raw}` : `${ariaLabel} (${raw})`,
    style: hashToColor(tagColorKey(parsed)),
  };
}

/**
 * Bucket tags by axis for grouped rendering.
 *
 * Axes are ordered alphabetically with the unfaceted bucket last, so the same
 * axis lands in the same position on every row and in every list. Order
 * within a bucket is preserved, leaving whatever ranking the caller supplied
 * (autocomplete relevance, stored order) intact.
 */
export function groupTagsByFacet(tags: string[]): TagFacetGroup[] {
  const buckets = new Map<string, ParsedTag[]>();
  const unfaceted: ParsedTag[] = [];
  for (const raw of tags) {
    const parsed = parseTag(raw);
    if (parsed.facet === null) {
      unfaceted.push(parsed);
      continue;
    }
    const bucket = buckets.get(parsed.facet);
    if (bucket) bucket.push(parsed);
    else buckets.set(parsed.facet, [parsed]);
  }
  const groups: TagFacetGroup[] = [...buckets.entries()]
    .toSorted(([a], [b]) => a.localeCompare(b))
    .map(([facet, bucketTags]) => ({ facet, label: formatFacet(facet), tags: bucketTags }));
  if (unfaceted.length > 0) {
    groups.push({ facet: null, label: UNFACETED_LABEL, tags: unfaceted });
  }
  return groups;
}

/**
 * Flatten `groupTagsByFacet` — the same ordering, for rows that show chips
 * inline rather than under headings.
 */
export function orderTagsByFacet(tags: string[]): ParsedTag[] {
  return groupTagsByFacet(tags).flatMap((group) => group.tags);
}

/**
 * The vocabulary tag a typed string names.
 *
 * Pickers show the value alone, so someone who types what they can see means
 * the faceted tag behind it — without this, typing `bar` next to a listed
 * "Bar" mints a second, unfaceted `bar` alongside `venue:bar`.
 *
 * The stored string wins; the displayed value is only accepted when exactly
 * one tag carries it, because two axes sharing a value is genuinely
 * ambiguous and belongs to the user, not to a guess.
 */
export function resolveTypedTag(input: string, availableTags: string[]): string | undefined {
  const typed = input.trim().toLowerCase();
  if (typed === '') return undefined;
  const stored = availableTags.find((tag) => tag.toLowerCase() === typed);
  if (stored !== undefined) return stored;
  const byValue = availableTags.filter((tag) => {
    const parsed = parseTag(tag);
    return parsed.value.toLowerCase() === typed || formatTagValue(parsed).toLowerCase() === typed;
  });
  return byValue.length === 1 ? byValue[0] : undefined;
}

/**
 * Whether the list carries a specific taxonomy tag.
 *
 * Callers name the axis and the value separately because a whole-string
 * literal is exactly what a namespace rename breaks silently — matching on
 * the parsed pair means a moved value fails a test rather than a badge.
 * Comparison is case-insensitive, matching the rest of this module's
 * tolerance for hand-typed casing.
 */
export function hasTagValue(tags: string[], facet: string, value: string): boolean {
  const wantedFacet = facet.toLowerCase();
  const wantedValue = value.toLowerCase();
  return tags.some((raw) => {
    const parsed = parseTag(raw);
    return (
      parsed.facet?.toLowerCase() === wantedFacet && parsed.value.toLowerCase() === wantedValue
    );
  });
}

/**
 * Rank a vocabulary against what the user has typed, for autocomplete.
 *
 * Prefix matches come before substring matches, and already-selected tags
 * never appear. An empty input ranks nothing and returns the unselected
 * vocabulary in its given order. The result is uncapped: how many entries a
 * picker shows is its own layout decision.
 */
export function rankTagSuggestions(
  input: string,
  availableTags: string[],
  selectedTags: string[]
): string[] {
  const unselected = availableTags.filter((tag) => !selectedTags.includes(tag));
  if (input === '') return unselected;
  const lower = input.toLowerCase();
  const startsWith: string[] = [];
  const contains: string[] = [];
  for (const tag of unselected) {
    const tagLower = tag.toLowerCase();
    if (tagLower.startsWith(lower)) startsWith.push(tag);
    else if (tagLower.includes(lower)) contains.push(tag);
  }
  return [...startsWith, ...contains];
}
