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
export const PROMPT_VERSION_CATEGORIZE = 'categorize-v4.4';

/** Versioned telemetry tag for the batched categorizer prompt (CF096/#3671). */
export const PROMPT_VERSION_CATEGORIZE_BATCH = 'categorize-batch-v4.4';

/**
 * Versioned telemetry tag for the tag-only prompt (POPS-2596) — the shape that
 * classifies a row whose merchant is already known. Kept separate from the
 * categorize versions so this path's cost and its accept/reject quality are
 * readable on their own rather than folded into entity categorization.
 */
export const PROMPT_VERSION_TAGS_ONLY = 'tags-v3.5';

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
  const location = input.location === undefined ? '' : sanitizePromptField(input.location);
  if (location !== '') lines.push(`Location: ${location}`);
  return lines.join('\n');
}

/**
 * The transaction block for a row whose merchant is already resolved: the
 * entity is *given*, so the model classifies rather than identifies. The
 * merchant name is sanitized at this boundary like every other interpolated
 * field — it reaches here from the contacts pillar, which is not a source the
 * prompt gets to trust unconditionally.
 *
 * `transactionType` is rendered only here (POPS-3678). A row reaches this shape
 * already resolved, so its type is known; a row reaches the categorize shapes
 * precisely because nothing could type it yet, and there is none to send.
 */
export function buildMatchedTransactionData(
  entityName: string,
  input: CategorizerInput,
  transactionType?: string
): string {
  const lines = [`Merchant: ${sanitizePromptField(entityName)}`];
  const type = transactionType === undefined ? '' : sanitizePromptField(transactionType);
  if (type !== '') lines.push(`Type: ${type}`);
  return `${lines.join('\n')}\n${buildTransactionData(input)}`;
}

export const ENTITY_NAME_RULES = `entityName rules:
- Return the brand or chain name only (e.g. "Woolworths", "Metro Petroleum", "Transport for NSW").
- Do NOT include store numbers, location codes, or postcode segments — strip them.
- Do NOT include trailing suburb / city names or postcodes present in the description — strip location noise from the merchant name.
- Strip company/legal-entity suffixes from the name — "Pty", "Pty Ltd", "Ltd", "Limited", "Inc", "Incorporated", "LLC", "PLC", "GmbH", "Co", "Corp", including punctuation variants like "Pty. Ltd.". e.g. "THE REDFERN PTY LTD" -> "The Redfern".
- Return the brand's natural / title casing, NOT the verbatim ALL-CAPS from the bank description — UNLESS the brand is conventionally written in all caps (e.g. IKEA, KFC, BP, IGA, HSBC, H&M). Preserve genuinely mixed-case brands exactly (e.g. eBay, iiNet).
- If you cannot identify a real merchant from the description, return entityName as null.
  Do NOT invent placeholder names like "Unknown Membership Organization", "Generic Merchant", "Unidentified Vendor", or similar — null is the correct answer when the merchant is unrecoverable.`;

/**
 * Stated in each prompt's opening, before the transaction and the axis list
 * (POPS-3667). It used to live only at the tail of {@link TAGS_RULES}, after an
 * opening that told the model to classify on every axis, and the opening won:
 * a crypto wallet top-up came back `occasion:out + contains:food +
 * venue:takeaway + channel:in-person`, the head of each usage-ranked list, where
 * the true answer on every offered axis was null.
 */
export const AXIS_OPTIONALITY =
  'Return the best-supported listed values as suggestions. A reasonable inference from a clear merchant or transaction description is useful even when it is not certain; report that uncertainty in confidence. Leave an axis empty (null for a single-valued field, [] for a list field) only when no listed value is reasonably supported. Do not fill every axis just to avoid an empty answer.';

export const TAGS_RULES = `tag rules:
- Each tag field above is a closed set. Choose only from the values listed for that field.
- Where a value is followed by a description, that description is its definition. Classify against it, not against what the word suggests on its own.
- The fields ask three different questions and a transaction often answers only some of them: occasion is the social setting the money was spent in, venue is what kind of place it was spent at, and contains is what was actually bought. Do not restate one field's answer in another.
- A value that is not listed is not available. If nothing listed fits a field, return null (or [] for a list field) — do NOT invent a value, coin a near-synonym, or return a value from a different field's list.
- Use a clearly identified merchant's well-known business type as evidence, alongside the transaction details and any prior tags. Include a useful, evidence-backed candidate even when it is an inference; lower confidence when the evidence is incomplete instead of omitting a plausible tag solely because certainty is not absolute. Do not infer from an ambiguous merchant name. Leave a field empty only when no listed value is reasonably supported. Routine provisioning — a grocery run, a fuel stop, a subscription — genuinely has no occasion, and leaving the field null is right where picking the nearest value is wrong.`;

/**
 * What a tag confidence means (POPS-3671). Shared by every shape that asks for
 * one: the categorize shapes call the field `tagConfidence`, beside the
 * merchant's `confidence`; the tag-only shape, which has no merchant to rate,
 * calls it `confidence`.
 */
export function tagConfidenceRule(field: string): string {
  return `- ${field} (0.0-1.0) is your confidence that every tag you returned is a useful and correct suggestion for the transaction. 1.0 only when the evidence leaves no doubt; lower it when a tag is inferred. Confidence controls pre-acceptance, not whether you should return a reasonable candidate.`;
}

export const CONFIDENCE_RULES = `confidence rules:
- confidence (0.0-1.0) is your confidence that entityName is the correct merchant. 1.0 only when the description unambiguously names a known brand; lower it for an inferred/guessed name, and lower it further when entityName is null.
${tagConfidenceRule('tagConfidence')}`;

export function knownEntitiesSection(knownEntityNames: string[], reuseInstruction: string): string {
  return knownEntityNames.length > 0
    ? `\n\nKnown entities: ${knownEntityNames.join(', ')}\n${reuseInstruction}`
    : '';
}
