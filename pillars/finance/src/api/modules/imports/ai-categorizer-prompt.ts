/**
 * Shared prompt-building pieces for the categorizer's single-row and batched
 * callers (`ai-categorizer-api.ts` / `ai-categorizer-batch-api.ts`,
 * CP025/#3656) — the PII-safe transaction-data renderer (CF008) and the
 * entityName/tags/confidence rule blocks neither prompt shape varies.
 */
import type { CategorizerInput } from './ai-categorizer-types.js';

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

export const ENTITY_NAME_RULES = `entityName rules:
- Return the brand or chain name only (e.g. "Woolworths", "Metro Petroleum", "Transport for NSW").
- Do NOT include store numbers, location codes, or postcode segments — strip them.
- Do NOT include trailing suburb / city names or postcodes present in the description — strip location noise from the merchant name.
- Strip company/legal-entity suffixes from the name — "Pty", "Pty Ltd", "Ltd", "Limited", "Inc", "Incorporated", "LLC", "PLC", "GmbH", "Co", "Corp", including punctuation variants like "Pty. Ltd.". e.g. "THE REDFERN PTY LTD" -> "The Redfern".
- Return the brand's natural / title casing, NOT the verbatim ALL-CAPS from the bank description — UNLESS the brand is conventionally written in all caps (e.g. IKEA, KFC, BP, IGA, HSBC, H&M). Preserve genuinely mixed-case brands exactly (e.g. eBay, iiNet).
- If you cannot identify a real merchant from the description, return entityName as null.
  Do NOT invent placeholder names like "Unknown Membership Organization", "Generic Merchant", "Unidentified Vendor", or similar — null is the correct answer when the merchant is unrecoverable.`;

export const TAGS_RULES = `tags rules:
- Return 1-4 tags that describe this transaction.
- Prefer tags from the Known tags list when they fit.
- You MAY suggest new tags not in the list when they better describe this transaction (e.g. "EV", "Homelab", "Gift Card", "Fast Food").
- Do NOT use vague tags like "Other" or "Spending" unless nothing else fits.`;

export const CONFIDENCE_RULES = `confidence rules:
- Your confidence (0.0-1.0) that entityName is the correct merchant. 1.0 only when the description unambiguously names a known brand; lower it for an inferred/guessed name, and lower it further when entityName is null.`;

export function knownTagsList(knownTags: string[]): string {
  return knownTags.length > 0
    ? knownTags.join(', ')
    : 'Groceries, Transport, Dining, Shopping, Utilities, Subscriptions, Entertainment, Health, Insurance';
}

export function knownEntitiesSection(knownEntityNames: string[], reuseInstruction: string): string {
  return knownEntityNames.length > 0
    ? `\n\nKnown entities: ${knownEntityNames.join(', ')}\n${reuseInstruction}`
    : '';
}
