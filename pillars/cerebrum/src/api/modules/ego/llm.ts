/**
 * LLM port for the cerebrum ego conversation engine.
 *
 * Ego needs two capabilities from the model: a one-shot chat completion and a
 * token-by-token streaming completion (SSE). Both are modelled on the
 * {@link EgoLlm} port so the engine can be driven by a real Anthropic client in
 * production and by canned fakes in tests (tests MUST NOT reach a real API).
 *
 * Deviations from the monolith (parity with the ingest slice):
 * - **Model overrides / settings**: the monolith reads
 *   `getSettingValue('ego.*')`. The pillar has no settings service, so the
 *   model is a hardcoded constant with an optional `CEREBRUM_EGO_MODEL` env
 *   override and the chat token, effort and temperature knobs are constants.
 * - **Inference logging**: usage/cost/latency is reported to the ai pillar via
 *   `@pops/ai-telemetry` (`callWithLogging` for chat, `callWithLoggingStream`
 *   for the SSE stream — both fire-and-forget) plus the 429 backoff
 *   ({@link withRateLimitRetry}) for correctness.
 *
 * The request is built per model: temperature goes only to a model that still
 * accepts it and effort only to one that takes it, so an env override in either
 * direction stays a valid request. A refusal answers with
 * {@link EGO_REFUSAL_MSG}, never an empty reply.
 */
import Anthropic from '@anthropic-ai/sdk';

import {
  callWithLogging,
  callWithLoggingStream,
  messageText,
  samplingParams,
} from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  CEREBRUM_DOMAIN,
  cerebrumTelemetryDeps,
} from '../ai-telemetry-deps.js';
import { resolveAnthropicApiKey } from '../anthropic-key.js';
import { withRateLimitRetry } from '../ingest/llm.js';
import { effortParams, isRefusal } from '../llm-request.js';
import { EGO_REFUSAL_MSG, egoStreamEvents } from './stream-events.js';

import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';

export const DEFAULT_EGO_MODEL = 'claude-sonnet-5-5';

// Thinking tokens count against max_tokens on a model that thinks, so the cap
// covers a full-length reply plus the thinking a low-effort turn can spend.
const CHAT_MAX_TOKENS = 8000;
const CHAT_TEMPERATURE = 0.3;
const CHAT_EFFORT = 'low';
const LOG_CONTEXT = 'cerebrum-ego';

const LLM_UNAVAILABLE_MSG =
  'I can help with that, but the LLM is currently unavailable. Please try again later.';
const LLM_ERROR_MSG = 'I encountered an error while generating a response. Please try again.';

export type EgoChatMessage = { role: 'user' | 'assistant'; content: string };

/** Response from a one-shot chat completion. */
export interface EgoLlmResponse {
  content: string;
  tokensIn: number;
  tokensOut: number;
}

/** A partial text token yielded during streaming. */
export interface EgoStreamChunk {
  type: 'token';
  text: string;
}

/** Final metadata yielded when the stream completes. */
export interface EgoStreamDone {
  type: 'done';
  fullText: string;
  tokensIn: number;
  tokensOut: number;
}

export type EgoStreamEvent = EgoStreamChunk | EgoStreamDone;

/**
 * Capability the ego engine depends on. The real implementation degrades to a
 * canned "unavailable" message (chat) / fallback events (stream) when no API
 * key is configured, so a missing key never throws.
 */
export interface EgoLlm {
  /** Resolve the configured chat model id (env override → default). */
  model(): string;
  chat(systemPrompt: string, messages: EgoChatMessage[]): Promise<EgoLlmResponse>;
  stream(systemPrompt: string, messages: EgoChatMessage[]): AsyncGenerator<EgoStreamEvent>;
}

function envModel(): string {
  const value = process.env['CEREBRUM_EGO_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_EGO_MODEL;
}

function chatRequest(
  model: string,
  systemPrompt: string,
  messages: EgoChatMessage[]
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: CHAT_MAX_TOKENS,
    ...samplingParams(model, CHAT_TEMPERATURE),
    ...effortParams(model, CHAT_EFFORT),
    system: systemPrompt,
    messages,
  };
}

function* fallbackEvents(text: string): Generator<EgoStreamEvent> {
  yield { type: 'token', text };
  yield { type: 'done', fullText: text, tokensIn: 0, tokensOut: 0 };
}

/**
 * Real Anthropic-backed {@link EgoLlm}. Reads `ANTHROPIC_API_KEY` lazily on
 * each call so a missing key degrades gracefully rather than throwing at
 * construction. The model id comes from `CEREBRUM_EGO_MODEL` or
 * {@link DEFAULT_EGO_MODEL}.
 */
export class AnthropicEgoLlm implements EgoLlm {
  model(): string {
    return envModel();
  }

  async chat(systemPrompt: string, messages: EgoChatMessage[]): Promise<EgoLlmResponse> {
    const apiKey = resolveAnthropicApiKey();
    if (apiKey === undefined) {
      console.warn('[cerebrum-ego] ANTHROPIC_API_KEY not set — returning unavailable message');
      return { content: LLM_UNAVAILABLE_MSG, tokensIn: 0, tokensOut: 0 };
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = this.model();
    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: 'ego.chat',
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () => client.messages.create(chatRequest(model, systemPrompt, messages)),
              'ego.chat'
            );
            return {
              response: created,
              usage: {
                inputTokens: created.usage.input_tokens,
                outputTokens: created.usage.output_tokens,
              },
              ...(created.stop_reason !== null ? { stopReason: created.stop_reason } : {}),
            };
          },
        },
        cerebrumTelemetryDeps()
      );
      return {
        content: isRefusal(response, LOG_CONTEXT) ? EGO_REFUSAL_MSG : messageText(response.content),
        tokensIn: response.usage.input_tokens,
        tokensOut: response.usage.output_tokens,
      };
    } catch (err) {
      console.warn(
        `[cerebrum-ego] chat failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return { content: LLM_ERROR_MSG, tokensIn: 0, tokensOut: 0 };
    }
  }

  async *stream(systemPrompt: string, messages: EgoChatMessage[]): AsyncGenerator<EgoStreamEvent> {
    const apiKey = resolveAnthropicApiKey();
    if (apiKey === undefined) {
      console.warn('[cerebrum-ego] ANTHROPIC_API_KEY not set — returning unavailable message');
      yield* fallbackEvents(LLM_UNAVAILABLE_MSG);
      return;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = this.model();
    let messageStream: MessageStream;
    try {
      messageStream = client.messages.stream(chatRequest(model, systemPrompt, messages));
    } catch (err) {
      console.warn(
        `[cerebrum-ego] stream creation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      yield* fallbackEvents(LLM_ERROR_MSG);
      return;
    }

    let stopReason: string | undefined;
    yield* callWithLoggingStream(
      {
        provider: ANTHROPIC_PROVIDER,
        model,
        operation: 'ego.stream',
        domain: CEREBRUM_DOMAIN,
        stream: () =>
          egoStreamEvents(messageStream, (reason) => {
            stopReason = reason;
          }),
        extractUsage: (last) =>
          last?.type === 'done'
            ? { inputTokens: last.tokensIn, outputTokens: last.tokensOut }
            : null,
        extractStopReason: () => stopReason,
      },
      cerebrumTelemetryDeps()
    );
  }
}
