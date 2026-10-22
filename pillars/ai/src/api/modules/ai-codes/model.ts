import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging, messageText, resolveSecret } from '@pops/ai-telemetry';

import { aiModelPricingService, type AiDb } from '../../../db/index.js';
import { getAnthropicApiKey } from '../../shared/anthropic-api-key.js';
import { logger } from '../../shared/logger.js';
import { recordInference } from '../ai-usage/record.js';
import { CODE_PROMPT_VERSION, CODE_REPLY_SCHEMA, CODE_SYSTEM_PROMPT } from './prompt.js';

/** The model that suggests codes unless `AI_CODES_MODEL` names another. */
export const DEFAULT_CODES_MODEL = 'claude-opus-5-5';

/** Env var overriding {@link DEFAULT_CODES_MODEL}. */
export const CODES_MODEL_ENV = 'AI_CODES_MODEL';

const ANTHROPIC_PROVIDER = 'anthropic';
const MAX_TOKENS = 4_000;
/** A person is waiting on this answer, so a slow call gives way to deterministic numbering. */
const REQUEST_TIMEOUT_MS = 15_000;

/** A model's answer to one prompt, before any parsing. */
export type CodeModelReply =
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'refused' }
  | { readonly kind: 'truncated' };

/** Sends one user prompt under the code-suggestion system prompt. */
export type CodeModel = (prompt: string) => Promise<CodeModelReply>;

/** The configured model id, honouring {@link CODES_MODEL_ENV}. */
export function codesModelId(env: NodeJS.ProcessEnv = process.env): string {
  const override = env[CODES_MODEL_ENV]?.trim();
  return override === undefined || override === '' ? DEFAULT_CODES_MODEL : override;
}

function resolveApiKey(): string | undefined {
  const key = resolveSecret(
    { fileEnvVar: 'ANTHROPIC_API_KEY_FILE', envVar: 'ANTHROPIC_API_KEY' },
    'ai-api'
  );
  if (key !== undefined) return key;
  const legacy = getAnthropicApiKey();
  return legacy === '' ? undefined : legacy;
}

function toReply(message: Anthropic.Beta.Messages.BetaMessage): CodeModelReply {
  if (message.stop_reason === 'refusal') {
    logger.warn(
      { category: message.stop_details?.category ?? 'unspecified' },
      '[ai.codes] model declined the request'
    );
    return { kind: 'refused' };
  }
  if (message.stop_reason === 'max_tokens') return { kind: 'truncated' };
  return { kind: 'text', text: messageText(message.content) };
}

/**
 * The production {@link CodeModel}, or null when no API key is configured.
 *
 * Usage, cost and latency land in this pillar's own ledger through
 * `@pops/ai-telemetry`, written in-process rather than POSTed to itself.
 * Server-side fallbacks let a refused request be retried on another model
 * inside the same call.
 */
export function createAnthropicCodeModel(db: AiDb): CodeModel | null {
  const apiKey = resolveApiKey();
  if (apiKey === undefined) return null;

  const client = new Anthropic({ apiKey, timeout: REQUEST_TIMEOUT_MS, maxRetries: 0 });
  const model = codesModelId();
  const pricing = aiModelPricingService.createPricingCache(db);
  const deps = {
    lookupPricing: (provider: string, id: string) => Promise.resolve(pricing.lookup(provider, id)),
    report: (record: Parameters<typeof recordInference>[1]) => {
      recordInference(db, record);
      return Promise.resolve();
    },
    warn: (message: string, error: unknown) => {
      logger.warn({ err: error }, message);
    },
  };

  return (prompt) =>
    callWithLogging(
      {
        domain: 'ai',
        operation: 'codes-suggest',
        provider: ANTHROPIC_PROVIDER,
        model,
        promptVersion: CODE_PROMPT_VERSION,
        call: async () => {
          const message = await client.beta.messages.create({
            model,
            max_tokens: MAX_TOKENS,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: {
              effort: 'low',
              format: { type: 'json_schema', schema: CODE_REPLY_SCHEMA },
            },
            system: CODE_SYSTEM_PROMPT,
            messages: [{ role: 'user', content: prompt }],
          });
          return {
            response: toReply(message),
            usage: {
              inputTokens: message.usage.input_tokens,
              outputTokens: message.usage.output_tokens,
            },
          };
        },
      },
      deps
    );
}
