/**
 * Anthropic request + response parsing for the categorizer. Ported from the
 * monolith `imports/lib/ai-categorizer-api.ts`. Usage/cost/latency is reported
 * to the ai pillar through `@pops/ai-telemetry` (`callWithLogging`,
 * fire-and-forget) — telemetry never alters the call's behaviour.
 *
 * Only an allowlist of transaction fields is sent to the API — the merchant
 * description plus its amount and date — never the raw CSV row or any
 * account/card/reference columns. `contextId` is an opaque import-batch key,
 * never the description, so the telemetry store carries no PII.
 */
import { callWithLogging } from '@pops/ai-telemetry';

import { ANTHROPIC_PROVIDER, FINANCE_DOMAIN, financeTelemetryDeps } from '../ai-telemetry-deps.js';
import { AiCategorizationError } from './ai-categorizer-error.js';
import { withRateLimitRetry } from './ai-retry.js';
import { sanitizeEntityName } from './entity-name.js';

export { sanitizeEntityName } from './entity-name.js';

import type Anthropic from '@anthropic-ai/sdk';

import type { AiCacheEntry, CategorizerInput } from './ai-categorizer.js';

export const CATEGORIZE_OPERATION = 'imports.categorize';

export interface ApiCallResponse {
  text: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface ApiCallOptions {
  client: Anthropic;
  input: CategorizerInput;
  sanitizedDescription: string;
  model: string;
  maxTokens: number;
  knownTags: string[];
  /** Opaque import-batch key for telemetry correlation (never the description). */
  contextId?: string;
}

/**
 * Render the allowlisted transaction fields as the prompt's "Transaction data"
 * block. Only {@link CategorizerInput} fields are interpolated — never a raw
 * row or arbitrary column values (CF008).
 */
function buildTransactionData(input: CategorizerInput): string {
  const lines = [`Description: ${input.description}`];
  if (input.amount !== undefined) lines.push(`Amount: ${input.amount}`);
  if (input.date !== undefined && input.date !== '') lines.push(`Date: ${input.date}`);
  return lines.join('\n');
}

export function buildPrompt(input: CategorizerInput, knownTags: string[]): string {
  const tagList =
    knownTags.length > 0
      ? knownTags.join(', ')
      : 'Groceries, Transport, Dining, Shopping, Utilities, Subscriptions, Entertainment, Health, Insurance';
  return `Given this bank transaction, identify the merchant/entity name and relevant spending tags.

${buildTransactionData(input)}

Known tags: ${tagList}

Reply in JSON only: {"entityName": "...", "tags": ["tag1", "tag2"]}

entityName rules:
- Return the brand or chain name only (e.g. "Woolworths", "Metro Petroleum", "Transport for NSW").
- Do NOT include store numbers, location codes, or postcode segments — strip them.
- Do NOT include trailing suburb / city names or postcodes present in the description — strip location noise from the merchant name.
- Strip company/legal-entity suffixes from the name — "Pty", "Pty Ltd", "Ltd", "Limited", "Inc", "Incorporated", "LLC", "PLC", "GmbH", "Co", "Corp", including punctuation variants like "Pty. Ltd.". e.g. "THE REDFERN PTY LTD" -> "The Redfern".
- Return the brand's natural / title casing, NOT the verbatim ALL-CAPS from the bank description — UNLESS the brand is conventionally written in all caps (e.g. IKEA, KFC, BP, IGA, HSBC, H&M). Preserve genuinely mixed-case brands exactly (e.g. eBay, iiNet).
- If you cannot identify a real merchant from the description, return entityName as null.
  Do NOT invent placeholder names like "Unknown Membership Organization", "Generic Merchant", "Unidentified Vendor", or similar — null is the correct answer when the merchant is unrecoverable.

tags rules:
- Return 1-4 tags that describe this transaction.
- Prefer tags from the Known tags list when they fit.
- You MAY suggest new tags not in the list when they better describe this transaction (e.g. "EV", "Homelab", "Gift Card", "Fast Food").
- Do NOT use vague tags like "Other" or "Spending" unless nothing else fits.`;
}

export async function callApi(opts: ApiCallOptions): Promise<ApiCallResponse> {
  const { client, input, sanitizedDescription, model, maxTokens, knownTags, contextId } = opts;
  const response = await callWithLogging(
    {
      provider: ANTHROPIC_PROVIDER,
      model,
      operation: CATEGORIZE_OPERATION,
      domain: FINANCE_DOMAIN,
      ...(contextId !== undefined ? { contextId } : {}),
      call: async () => {
        const created = await withRateLimitRetry(
          () =>
            client.messages.create({
              model,
              max_tokens: maxTokens,
              messages: [{ role: 'user', content: buildPrompt(input, knownTags) }],
            }),
          sanitizedDescription
        );
        return {
          response: created,
          usage: {
            inputTokens: created.usage.input_tokens,
            outputTokens: created.usage.output_tokens,
          },
        };
      },
    },
    financeTelemetryDeps()
  );
  const block = response.content[0];
  const text = block?.type === 'text' ? block.text : null;
  return {
    text,
    inputTokens: response.usage.input_tokens,
    outputTokens: response.usage.output_tokens,
  };
}

function stripCodeFences(text: string): string {
  return text
    .trim()
    .replaceAll(/^```(?:json)?\s*\n?/gm, '')
    .replaceAll(/\n?```\s*$/gm, '');
}

/**
 * Extract the first balanced top-level JSON object from `text`, tolerating
 * prose the model may add before or after it — Haiku sometimes pretty-prints
 * the object and then appends an explanatory sentence, which naive
 * whole-string `JSON.parse` rejects ("Unexpected non-whitespace character
 * after JSON"). String literals are respected so braces inside values don't
 * unbalance the scan. Returns null when no complete object is present.
 */
function extractFirstJsonObject(text: string): string | null {
  const start = text.indexOf('{');
  if (start === -1) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return text.slice(start, i + 1);
  }
  return null;
}

/**
 * Parse the model's reply into an {@link AiCacheEntry}. Throws
 * `AiCategorizationError('…','PARSE_ERROR')` when the reply holds no parseable
 * JSON object, so the caller degrades the row to *uncertain* rather than
 * hard-failing the whole transaction.
 */
export function buildEntryFromText(text: string): AiCacheEntry {
  const jsonSlice = extractFirstJsonObject(stripCodeFences(text));
  if (jsonSlice === null) {
    throw new AiCategorizationError(
      `AI categorizer returned no JSON object: ${text.slice(0, 120)}`,
      'PARSE_ERROR'
    );
  }
  let parsed: { entityName?: string | null; tags?: unknown; category?: string };
  try {
    parsed = JSON.parse(jsonSlice) as typeof parsed;
  } catch (error) {
    throw new AiCategorizationError(
      `AI categorizer returned unparseable JSON: ${
        error instanceof Error ? error.message : 'parse error'
      }`,
      'PARSE_ERROR'
    );
  }
  const tags = Array.isArray(parsed.tags)
    ? parsed.tags.filter((t): t is string => typeof t === 'string')
    : undefined;
  return {
    entityName: sanitizeEntityName(parsed.entityName ?? null),
    category: tags?.[0] ?? parsed.category ?? '',
    tags,
  };
}

export function throwApiError(error: unknown): never {
  if (error && typeof error === 'object' && 'status' in error) {
    const apiError = error as {
      status: number;
      message?: string;
      error?: { error?: { message?: string } };
    };
    if (apiError.status === 400) {
      const msg = apiError.error?.error?.message ?? apiError.message ?? 'Unknown API error';
      if (msg.toLowerCase().includes('credit balance')) {
        throw new AiCategorizationError(
          'Anthropic API credit balance too low. Please add credits at https://console.anthropic.com/settings/plans',
          'INSUFFICIENT_CREDITS'
        );
      }
    }
    throw new AiCategorizationError(
      `Anthropic API error: ${apiError.message ?? 'Unknown error'}`,
      'API_ERROR'
    );
  }
  throw new AiCategorizationError(
    `Failed to categorize: ${error instanceof Error ? error.message : 'Unknown error'}`,
    'API_ERROR'
  );
}

export async function callApiOrThrow(opts: ApiCallOptions): Promise<ApiCallResponse> {
  try {
    return await callApi(opts);
  } catch (error) {
    console.error(
      `[AI] API call failed for "${opts.sanitizedDescription}": ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    throwApiError(error);
  }
}
