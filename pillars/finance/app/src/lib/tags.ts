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
 * Turn what someone typed into the value half of a stored tag:
 * `Cairns 2026` → `cairns-2026`.
 *
 * Stored values are lower-case hyphenated slugs, and until this existed the
 * only way to add one was to type the slug by hand — so what actually landed in
 * the vocabulary was whatever the field held, spaces and capitals included, as
 * a tag no other row would ever match. Accents are folded rather than dropped
 * so `Café` and `Cafe` cannot become two values.
 *
 * Returns `''` when nothing survives (`'!!!'`), which callers read as "there is
 * no tag to create here" rather than minting an empty value.
 */
export function slugifyTagValue(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Compose the stored form of a tag from its axis and a slugified value. */
export function composeTag(facet: string, value: string): string {
  return `${facet}${FACET_SEPARATOR}${value}`;
}

/** Who may mint a value on a facet — mirrors the pillar's `TagFacetKind`. */
export type TagFacetKind = 'closed' | 'open' | 'marker';

/** One axis of the taxonomy, as the API reports it. */
export interface TagFacetOption {
  facet: string;
  kind: TagFacetKind;
}

/**
 * What typing `input` into a tag picker would create.
 *
 * A tag has to name an axis to be worth anything — an unfaceted `Cairns 2026`
 * is invisible to every report that groups by facet — so creating one is a
 * choice of axis, and this is the state machine that choice runs through.
 *
 * - `none` — nothing typed, or nothing survives slugging (`!!!`).
 * - `ready` — the text already names an open axis (`trip:cairns 2026`), so
 *   there is a tag to add and nothing left to ask.
 * - `choose` — a bare value: the user picks which axis it belongs to.
 * - `refused` — the text names an axis nobody may mint on. A closed axis holds
 *   a fixed set of values and a marker axis is written from provenance, so the
 *   answer is not "pick a different name" but "this is not yours to create",
 *   and saying so here is what stops the commit rejecting it three screens
 *   later.
 */
export type TagCreationIntent =
  | { kind: 'none' }
  | { kind: 'ready'; tag: string }
  | { kind: 'choose'; value: string; facets: string[] }
  | { kind: 'refused'; facet: string; facetKind: Exclude<TagFacetKind, 'open'> };

/**
 * Decide what the typed text would create, given the taxonomy.
 *
 * An unrecognised prefix is not treated as a facet: `4:30 coffee` names no
 * axis, and inventing one from any colon a user types would grow the taxonomy
 * by accident. It falls through to `choose`, with the whole string slugged.
 */
export function planTagCreation(
  input: string,
  facets: readonly TagFacetOption[]
): TagCreationIntent {
  const mintable = facets.filter((option) => option.kind === 'open').map((option) => option.facet);
  const parsed = parseTag(input.trim());
  const named = parsed.facet === null ? undefined : facets.find((o) => o.facet === parsed.facet);
  if (named !== undefined && named.kind !== 'open') {
    return { kind: 'refused', facet: named.facet, facetKind: named.kind };
  }
  if (named !== undefined) {
    const value = slugifyTagValue(parsed.value);
    return value === '' ? { kind: 'none' } : { kind: 'ready', tag: composeTag(named.facet, value) };
  }
  const value = slugifyTagValue(input);
  if (value === '' || mintable.length === 0) return { kind: 'none' };
  return { kind: 'choose', value, facets: mintable };
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
