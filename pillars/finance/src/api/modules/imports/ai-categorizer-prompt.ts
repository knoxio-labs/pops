/**
 * Shared prompt-building pieces for the categorizer's single-row and batched
 * callers (`ai-categorizer-api.ts` / `ai-categorizer-batch-api.ts`,
 * CP025/#3656) — the PII-safe transaction-data renderer (CF008) and the
 * entityName/tags/confidence rule blocks neither prompt shape varies.
 */
import { CLASSIFIED_TAG_FACETS, parseTagFacet } from '../../../db/tag-facets.js';

import type { ClassifiedTagFacet } from '../../../db/tag-facets.js';
import type { CategorizerInput } from './ai-categorizer-types.js';

/**
 * Versioned telemetry tag for the single-row categorizer prompt (CF096/#3671)
 * — bump on every prompt-shape change so accept/reject quality is joinable
 * per prompt revision.
 */
export const PROMPT_VERSION_CATEGORIZE = 'categorize-v3.0';

/** Versioned telemetry tag for the batched categorizer prompt (CF096/#3671). */
export const PROMPT_VERSION_CATEGORIZE_BATCH = 'categorize-batch-v3.0';

/**
 * Versioned telemetry tag for the tag-only prompt (POPS-2596) — the shape that
 * classifies a row whose merchant is already known. Kept separate from the
 * categorize versions so this path's cost and its accept/reject quality are
 * readable on their own rather than folded into entity categorization.
 */
export const PROMPT_VERSION_TAGS_ONLY = 'tags-v2.0';

const PROMPT_FIELD_MAX_CHARS = 200;

/**
 * Normalize an allowlisted string before it crosses into the prompt: collapse
 * every whitespace run (including newlines) to a single space, trim, and cap
 * length. Without this a description carrying newlines could inject extra prompt
 * lines (e.g. a forged `Known tags:` directive) and an unbounded one would bloat
 * token usage/cost. The fields are still allowlisted upstream — this only
 * hardens their rendering.
 */
function sanitizePromptField(value: string): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, PROMPT_FIELD_MAX_CHARS);
}

/**
 * Render the allowlisted transaction fields as the prompt's "Transaction data"
 * block. Only {@link CategorizerInput} fields are interpolated — never a raw
 * row or arbitrary column values (CF008) — and each is sanitized at the
 * boundary. Non-finite amounts are dropped rather than rendered as `NaN`/`Infinity`.
 */
export function buildTransactionData(input: CategorizerInput): string {
  const lines = [`Description: ${sanitizePromptField(input.description)}`];
  if (input.amount !== undefined && Number.isFinite(input.amount)) {
    lines.push(`Amount: ${input.amount}`);
  }
  if (input.date !== undefined && input.date !== '') {
    lines.push(`Date: ${sanitizePromptField(input.date)}`);
  }
  return lines.join('\n');
}

/**
 * The transaction block for a row whose merchant is already resolved: the
 * entity is *given*, so the model classifies rather than identifies. The
 * merchant name is sanitized at this boundary like every other interpolated
 * field — it reaches here from the contacts pillar, which is not a source the
 * prompt gets to trust unconditionally.
 */
export function buildMatchedTransactionData(entityName: string, input: CategorizerInput): string {
  return `Merchant: ${sanitizePromptField(entityName)}\n${buildTransactionData(input)}`;
}

export const ENTITY_NAME_RULES = `entityName rules:
- Return the brand or chain name only (e.g. "Woolworths", "Metro Petroleum", "Transport for NSW").
- Do NOT include store numbers, location codes, or postcode segments — strip them.
- Do NOT include trailing suburb / city names or postcodes present in the description — strip location noise from the merchant name.
- Strip company/legal-entity suffixes from the name — "Pty", "Pty Ltd", "Ltd", "Limited", "Inc", "Incorporated", "LLC", "PLC", "GmbH", "Co", "Corp", including punctuation variants like "Pty. Ltd.". e.g. "THE REDFERN PTY LTD" -> "The Redfern".
- Return the brand's natural / title casing, NOT the verbatim ALL-CAPS from the bank description — UNLESS the brand is conventionally written in all caps (e.g. IKEA, KFC, BP, IGA, HSBC, H&M). Preserve genuinely mixed-case brands exactly (e.g. eBay, iiNet).
- If you cannot identify a real merchant from the description, return entityName as null.
  Do NOT invent placeholder names like "Unknown Membership Organization", "Generic Merchant", "Unidentified Vendor", or similar — null is the correct answer when the merchant is unrecoverable.`;

export const TAGS_RULES = `tag rules:
- Each tag field above is a closed set. Choose only from the values listed for that field.
- Where a value is followed by a description, that description is its definition. Classify against it, not against what the word suggests on its own.
- The fields ask three different questions and a transaction often answers only some of them: occasion is the social setting the money was spent in, venue is what kind of place it was spent at, and contains is what was actually bought. Do not restate one field's answer in another.
- A value that is not listed is not available. If nothing listed fits a field, return null (or [] for a list field) — do NOT invent a value, coin a near-synonym, or return a value from a different field's list.
- Choose the most specific listed value that is true of the transaction, and omit a field you would only be guessing at. Omitting is a correct answer rather than a failure: routine provisioning — a grocery run, a fuel stop, a subscription — genuinely has no occasion, and leaving the field null is right where picking the nearest value is wrong.`;

export const CONFIDENCE_RULES = `confidence rules:
- Your confidence (0.0-1.0) that entityName is the correct merchant. 1.0 only when the description unambiguously names a known brand; lower it for an inferred/guessed name, and lower it further when entityName is null.`;

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

export function knownEntitiesSection(knownEntityNames: string[], reuseInstruction: string): string {
  return knownEntityNames.length > 0
    ? `\n\nKnown entities: ${knownEntityNames.join(', ')}\n${reuseInstruction}`
    : '';
}
