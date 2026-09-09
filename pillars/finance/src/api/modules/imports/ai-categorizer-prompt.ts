/**
 * Shared prompt-building pieces for the categorizer's single-row and batched
 * callers (`ai-categorizer-api.ts` / `ai-categorizer-batch-api.ts`,
 * CP025/#3656) — the PII-safe transaction-data renderer (CF008) and the
 * entityName/tags/confidence rule blocks neither prompt shape varies.
 */
import { sanitizePromptField } from '../vocabulary-prompt.js';

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

export function knownEntitiesSection(knownEntityNames: string[], reuseInstruction: string): string {
  return knownEntityNames.length > 0
    ? `\n\nKnown entities: ${knownEntityNames.join(', ')}\n${reuseInstruction}`
    : '';
}
