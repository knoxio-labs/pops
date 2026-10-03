/**
 * LLM port for the cerebrum document-generation engine.
 * Spec: pillars/cerebrum/docs/prds/document-generation.
 *
 * The generation pipeline needs one capability: send a system prompt + user
 * message and get the synthesised document text back. Modelled as the
 * {@link GenerationLlm} port so it runs against a real Anthropic client in
 * production and a canned fake in tests (tests MUST NOT reach a real API).
 *
 * Model is `DEFAULT_EMIT_MODEL` unless `CEREBRUM_EMIT_MODEL` overrides it;
 * max-tokens and effort are constants. The request is built per model
 * (temperature only where it is still accepted, effort only where it is
 * taken), so an override in either direction stays valid. Usage/cost is
 * reported to the ai pillar via `@pops/ai-telemetry` (`callWithLogging`,
 * fire-and-forget); the 429 backoff is {@link withRateLimitRetry}. A missing
 * API key returns a placeholder string rather than throwing; a transport error
 * throws so the handler surfaces a 500. A refusal and an output cut off at
 * max-tokens are both reported on the {@link GenerationOutput}, never as an
 * empty or silently short document.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging, messageText, samplingParams } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  CEREBRUM_DOMAIN,
  cerebrumTelemetryDeps,
} from '../ai-telemetry-deps.js';
import { resolveAnthropicApiKey } from '../anthropic-key.js';
import { withRateLimitRetry } from '../ingest/llm.js';
import { effortParams, isOutputTruncated, isRefusal } from '../llm-request.js';

export const DEFAULT_EMIT_MODEL = 'claude-sonnet-5-5';
const EMIT_OPERATION = 'emit.generate';
const DEFAULT_MAX_TOKENS = 8000;
const EMIT_EFFORT = 'medium';
const UNAVAILABLE_MSG = '(Document generation unavailable — LLM API key not configured)';

function emitModel(): string {
  const value = process.env['CEREBRUM_EMIT_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_EMIT_MODEL;
}

/**
 * Outcome of one generation call: the synthesised text, flagged when the model
 * ran out of output tokens before finishing it, or a refusal carrying no text.
 */
export type GenerationOutput =
  | { kind: 'text'; text: string; outputTruncated: boolean }
  | { kind: 'refused' };

/** Capability the generation modes depend on. */
export interface GenerationLlm {
  /**
   * Synthesise a document from a system prompt + user message. Returns a
   * placeholder text when the model is unavailable (no API key) and
   * `refused` when the model declines; throws on a transport error so the
   * caller surfaces a 500.
   */
  generate(systemPrompt: string, userMessage: string): Promise<GenerationOutput>;
}

/**
 * Real Anthropic-backed {@link GenerationLlm}. Reads `ANTHROPIC_API_KEY` lazily
 * so a missing key degrades to the unavailable placeholder rather than
 * throwing at construction.
 */
export class AnthropicGenerationLlm implements GenerationLlm {
  async generate(systemPrompt: string, userMessage: string): Promise<GenerationOutput> {
    const apiKey = resolveAnthropicApiKey();
    if (apiKey === undefined) {
      console.warn('[cerebrum-emit] ANTHROPIC_API_KEY not set — cannot generate document');
      return { kind: 'text', text: UNAVAILABLE_MSG, outputTruncated: false };
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = emitModel();
    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: EMIT_OPERATION,
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () =>
                client.messages.create({
                  model,
                  max_tokens: DEFAULT_MAX_TOKENS,
                  ...samplingParams(model, 0),
                  ...effortParams(model, EMIT_EFFORT),
                  system: systemPrompt,
                  messages: [{ role: 'user', content: userMessage }],
                }),
              'cerebrum.emit'
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
        cerebrumTelemetryDeps()
      );
      if (isRefusal(response, 'cerebrum-emit')) return { kind: 'refused' };
      return {
        kind: 'text',
        text: messageText(response.content),
        outputTruncated: isOutputTruncated(response),
      };
    } catch (err) {
      throw new Error(
        `Document generation failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }
}
