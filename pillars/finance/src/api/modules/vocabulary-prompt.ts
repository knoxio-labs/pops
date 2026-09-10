/**
 * Rendering the closed tag vocabulary into a prompt.
 *
 * Lives beside `imports/` and `corrections/` rather than inside either, because
 * both offer the same vocabulary to a model and neither owns it. It sat in
 * `imports/ai-categorizer-prompt.ts` until POPS-3287 gave rule generation the
 * same rendering: `imports/types.ts` already depends on `corrections/index.ts`,
 * so a `corrections -> imports` edge closed a dependency cycle. Duplicating the
 * rendering to dodge that would have let a prompt and the vocabulary its reply
 * is validated against drift apart, which is the failure this rendering exists
 * to prevent.
 *
 * Depends on `db/tag-facets.js` and nothing else.
 */
import { CLASSIFIED_TAG_FACETS, parseTagFacet } from '../../db/tag-facets.js';

import type { ClassifiedTagFacet } from '../../db/tag-facets.js';

const PROMPT_FIELD_MAX_CHARS = 200;

/**
 * Normalize an allowlisted string before it crosses into the prompt: collapse
 * every whitespace run (including newlines) to a single space, trim, and cap
 * length. Without this a description carrying newlines could inject extra prompt
 * lines (e.g. a forged `Known tags:` directive) and an unbounded one would bloat
 * token usage/cost. The fields are still allowlisted upstream — this only
 * hardens their rendering.
 */
export function sanitizePromptField(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, PROMPT_FIELD_MAX_CHARS);
}

/**
 * Thrown when the closed vocabulary is empty, which no prompt can be built
 * from. The categorizer's callers already degrade an `AiCategorizationError`
 * row to *uncertain*, so this surfaces loudly without failing the import.
 */
export class EmptyClosedVocabularyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EmptyClosedVocabularyError';
  }
}

/**
 * One offered value, with the definition the vocabulary holds for it or null
 * when it holds none (POPS-3285).
 */
export interface ClosedFacetValue {
  value: string;
  description: string | null;
}

/** One classified facet's values, in the order they were loaded (most-used first). */
export interface ClosedFacetOptions {
  facet: ClassifiedTagFacet;
  single: boolean;
  values: ClosedFacetValue[];
}

/** `facet:value` → its one-line definition, for the values that have one. */
export type TagDescriptions = ReadonlyMap<string, string>;

/**
 * A vocabulary description as it may be rendered: sanitized at the boundary
 * like every other interpolated field, and null when there is nothing left.
 *
 * The sanitization is not ceremony. A description is stored data, so a newline
 * in one would inject prompt lines exactly the way an unsanitized merchant
 * description would — the risk `sanitizePromptField` exists for — and a
 * whitespace-only value must read as "no description" rather than render a
 * value followed by a dangling colon.
 */
function renderableDescription(description: string | undefined): string | null {
  if (description === undefined) return null;
  const sanitized = sanitizePromptField(description);
  return sanitized === '' ? null : sanitized;
}

/**
 * Bucket the offered vocabulary into its facets, preserving the caller's order
 * within each — `loadKnownTags` ranks by usage, so the values that carry the
 * corpus lead each list.
 *
 * A facet with no values is dropped rather than rendered empty: a field whose
 * only legal answer is null is noise in the prompt. A tag outside the
 * classified facets is ignored here; it should not have reached the prompt path at all,
 * and dropping it silently is safer than showing the model a value it must not
 * emit.
 *
 * Throws {@link EmptyClosedVocabularyError} when nothing at all survives. The
 * migrations seed the closed vocabulary, so an empty one is a broken database,
 * not a cold start — the previous behaviour here was to substitute a
 * hand-written flat list (`Groceries, Transport, Dining, …`), which quietly
 * reintroduced the pre-migration taxonomy, including values that never existed
 * in `tag_vocabulary`.
 */
export function closedFacetOptions(
  knownTags: string[],
  descriptions: TagDescriptions = new Map()
): ClosedFacetOptions[] {
  const byFacet = new Map<string, ClosedFacetValue[]>();
  for (const tag of knownTags) {
    const { facet, value } = parseTagFacet(tag);
    if (facet === null) continue;
    const entry: ClosedFacetValue = {
      value,
      description: renderableDescription(descriptions.get(tag)),
    };
    const bucket = byFacet.get(facet);
    if (bucket) bucket.push(entry);
    else byFacet.set(facet, [entry]);
  }

  const options = CLASSIFIED_TAG_FACETS.map(({ facet, single }) => ({
    facet,
    single,
    values: byFacet.get(facet) ?? [],
  })).filter((option) => option.values.length > 0);

  if (options.length === 0) {
    throw new EmptyClosedVocabularyError(
      'Closed tag vocabulary is empty — tag_vocabulary holds no active value on a classified facet. ' +
        'A database built from migrations carries them; this one did not.'
    );
  }
  return options;
}

/**
 * Render the closed vocabulary as one prompt field per facet.
 *
 * This is the shape POPS-2606 turns on: the model is given a set of
 * classification fields with enumerated answers, not an open tag list to
 * generate into. `exactly one of` / `any of` states the cardinality inline as
 * well as in the JSON shape, because the two together are what make a second
 * `occasion` read as a violated instruction rather than an oversight.
 *
 * A facet renders in one of two forms, chosen by whether any of its values
 * carries a definition (POPS-3285):
 *
 * - **Compact**, `- channel: exactly one of [online, in-person]`, when none
 *   does. This is what every facet looked like before descriptions existed,
 *   and it stays the shape for an axis whose values need no gloss.
 * - **Block**, one value per line, when at least one does. A bare list of five
 *   words is what let `occasion:home` collect every row that was not obviously
 *   one of the other four: the model was asked to pick exactly one and given no
 *   criteria to pick on.
 *
 * Within a block an undescribed value renders as the bare value. Mixing the two
 * is deliberate — the alternative is either denying a described value its
 * definition or inventing filler for one that does not need it, and the column
 * is nullable precisely so neither is necessary.
 */
export function closedFacetFields(options: ClosedFacetOptions[]): string {
  return options
    .map(({ facet, single, values }) => {
      const cardinality = single ? 'exactly one of' : 'any of';
      if (!values.some((entry) => entry.description !== null)) {
        return `- ${facet}: ${cardinality} [${values.map((entry) => entry.value).join(', ')}]`;
      }
      const lines = values.map(({ value, description }) =>
        description === null ? `    - ${value}` : `    - ${value}: ${description}`
      );
      return [`- ${facet}: ${cardinality}`, ...lines].join('\n');
    })
    .join('\n');
}

/**
 * The JSON value shape for one facet field — a bare string for a single-valued
 * facet, an array for a multi-valued one, so the reply's own structure carries
 * the cardinality rather than relying on the model to count.
 */
export function closedFacetReplyShape(options: ClosedFacetOptions[]): string {
  return options
    .map(({ facet, single }) => `"${facet}": ${single ? '"..." | null' : '["..."]'}`)
    .join(', ');
}
