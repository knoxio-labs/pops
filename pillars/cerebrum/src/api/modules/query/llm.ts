/**
 * LLM ports for the cerebrum query engine.
 *
 * Two capabilities, both injectable so the engine runs against a real
 * Anthropic client in production and canned fakes in tests (tests MUST NOT
 * reach a real API):
 *
 *  - {@link QueryLlm}       — one-shot completion for `ask` (system + question →
 *                             text). Degrades to a display-safe fallback string
 *                             when the API key is missing, the call throws or
 *                             the model declines.
 *  - {@link QueryStreamLlm} — token-streaming completion for the SSE route,
 *                             yielding incremental text deltas then a final
 *                             token-usage record.
 *
 * Deviations from the monolith (parity with the ingest slice):
 * - Model overrides / settings → {@link DEFAULT_QUERY_MODEL} with an optional
 *   `CEREBRUM_QUERY_MODEL` env override. No settings-DB tier. The request is
 *   built per model (temperature only where it is still accepted, effort only
 *   where it is taken), so an override in either direction stays valid.
 * - Usage/cost is reported to the ai pillar via `@pops/ai-telemetry`
 *   (`callWithLogging` for `ask`, `callWithLoggingStream` for the SSE route —
 *   both fire-and-forget); the 429 backoff ({@link withRateLimitRetry}, reused
 *   from the ingest slice) is retained for correctness.
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

import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';

export const DEFAULT_QUERY_MODEL = 'claude-sonnet-5-5';
const QUERY_OPERATION = 'query.ask';
const QUERY_STREAM_OPERATION = 'query.stream';
// Thinking tokens count against max_tokens on a model that thinks, so the cap
// covers a full-length answer plus the thinking a low-effort turn can spend.
const DEFAULT_MAX_TOKENS = 4000;
const QUERY_EFFORT = 'low';
const LOG_CONTEXT = 'cerebrum-query';

const LLM_UNAVAILABLE_MSG =
  "I don't have enough information to answer that fully. (LLM unavailable)";
const LLM_ERROR_MSG = "I don't have enough information to answer that fully. (LLM error)";

/** Display-safe answer returned when the model declines the question. */
export const QUERY_REFUSAL_MSG = "I can't answer that. (The model declined this request)";

function queryModel(): string {
  const value = process.env['CEREBRUM_QUERY_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_QUERY_MODEL;
}

function queryRequest(
  model: string,
  systemPrompt: string,
  question: string
): Anthropic.Messages.MessageCreateParamsNonStreaming {
  return {
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    ...samplingParams(model, 0),
    ...effortParams(model, QUERY_EFFORT),
    system: systemPrompt,
    messages: [{ role: 'user', content: question }],
  };
}

/** One-shot query completion. */
export interface QueryLlm {
  /**
   * Return the model's answer for a system prompt + question. Always resolves
   * to a display-safe string — never throws — degrading to a fallback message
   * when the model is unavailable and to {@link QUERY_REFUSAL_MSG} when it
   * declines.
   */
  complete(systemPrompt: string, question: string): Promise<string>;
}

/** A single text delta yielded while the model streams. */
export interface QueryStreamDelta {
  kind: 'delta';
  text: string;
}

/** Terminal record yielded once the model stream completes. */
export interface QueryStreamFinal {
  kind: 'final';
  tokensIn: number;
  tokensOut: number;
}

export type QueryStreamChunk = QueryStreamDelta | QueryStreamFinal;

/** Token-streaming query completion. */
export interface QueryStreamLlm {
  /**
   * Stream the model's answer as text deltas, terminated by a single `final`
   * chunk carrying token usage. Never throws — a missing key / SDK error
   * yields a fallback delta then a zero-usage `final`, and a refusal yields
   * {@link QUERY_REFUSAL_MSG} as the closing delta.
   */
  stream(systemPrompt: string, question: string): AsyncGenerator<QueryStreamChunk>;
}

/**
 * Real Anthropic-backed {@link QueryLlm}. Reads `ANTHROPIC_API_KEY` lazily so a
 * missing key degrades to a fallback message rather than throwing.
 */
export class AnthropicQueryLlm implements QueryLlm {
  async complete(systemPrompt: string, question: string): Promise<string> {
    const apiKey = resolveAnthropicApiKey();
    if (apiKey === undefined) {
      console.warn('[cerebrum-query] ANTHROPIC_API_KEY not set — returning fallback answer');
      return LLM_UNAVAILABLE_MSG;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = queryModel();
    try {
      const response = await callWithLogging(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: QUERY_OPERATION,
          domain: CEREBRUM_DOMAIN,
          call: async () => {
            const created = await withRateLimitRetry(
              () => client.messages.create(queryRequest(model, systemPrompt, question)),
              'cerebrum.query'
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
      if (isRefusal(response, LOG_CONTEXT)) return QUERY_REFUSAL_MSG;
      return messageText(response.content);
    } catch (err) {
      console.warn(
        `[cerebrum-query] LLM call failed: ${err instanceof Error ? err.message : String(err)}`
      );
      return LLM_ERROR_MSG;
    }
  }
}

async function* iterateStream(stream: MessageStream): AsyncGenerator<QueryStreamChunk> {
  let streamedText = false;
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      streamedText = true;
      yield { kind: 'delta', text: event.delta.text };
    }
  }
  const finalMessage = await stream.finalMessage();
  if (isRefusal(finalMessage, LOG_CONTEXT)) {
    yield { kind: 'delta', text: streamedText ? `\n\n${QUERY_REFUSAL_MSG}` : QUERY_REFUSAL_MSG };
  }
  yield {
    kind: 'final',
    tokensIn: finalMessage.usage.input_tokens,
    tokensOut: finalMessage.usage.output_tokens,
  };
}

/**
 * Real Anthropic-backed {@link QueryStreamLlm}. Mirrors {@link AnthropicQueryLlm}'s
 * degradation: a missing key yields the unavailable fallback, an SDK error
 * yields the error fallback, both terminated by a zero-usage `final`.
 */
export class AnthropicQueryStreamLlm implements QueryStreamLlm {
  async *stream(systemPrompt: string, question: string): AsyncGenerator<QueryStreamChunk> {
    const apiKey = resolveAnthropicApiKey();
    if (apiKey === undefined) {
      console.warn('[cerebrum-query] ANTHROPIC_API_KEY not set — yielding fallback answer');
      yield { kind: 'delta', text: LLM_UNAVAILABLE_MSG };
      yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
      return;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = queryModel();
    let stream: MessageStream;
    try {
      stream = client.messages.stream(queryRequest(model, systemPrompt, question));
    } catch (err) {
      console.warn(
        `[cerebrum-query] stream creation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      yield { kind: 'delta', text: LLM_ERROR_MSG };
      yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
      return;
    }

    try {
      yield* callWithLoggingStream(
        {
          provider: ANTHROPIC_PROVIDER,
          model,
          operation: QUERY_STREAM_OPERATION,
          domain: CEREBRUM_DOMAIN,
          stream: () => iterateStream(stream),
          extractUsage: (last) =>
            last?.kind === 'final'
              ? { inputTokens: last.tokensIn, outputTokens: last.tokensOut }
              : null,
        },
        cerebrumTelemetryDeps()
      );
    } catch (err) {
      console.warn(
        `[cerebrum-query] stream processing failed: ${err instanceof Error ? err.message : String(err)}`
      );
      yield { kind: 'final', tokensIn: 0, tokensOut: 0 };
    }
  }
}
