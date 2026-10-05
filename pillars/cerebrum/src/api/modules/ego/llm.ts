/**
 * LLM port for the cerebrum ego conversation engine.
 *
 * Ego needs one capability from the model: a token-by-token streaming turn
 * (SSE) that may carry tool definitions and reports the tool calls the model
 * made. It is modelled on the {@link EgoLlm} port so the engine can be driven
 * by a real Anthropic client in production and by canned fakes in tests (tests
 * MUST NOT reach a real API).
 *
 * Deviations from the monolith (parity with the ingest slice):
 * - **Model overrides / settings**: the monolith reads
 *   `getSettingValue('ego.*')`. The pillar has no settings service, so the
 *   model is a hardcoded constant with an optional `CEREBRUM_EGO_MODEL` env
 *   override and the chat token, effort and temperature knobs are constants.
 * - **Inference logging**: usage/cost/latency is reported to the ai pillar via
 *   `@pops/ai-telemetry` (`callWithLoggingStream`, fire-and-forget), one record
 *   per model call.
 *
 * The request is built per model: temperature goes only to a model that still
 * accepts it and effort only to one that takes it, so an env override in either
 * direction stays a valid request. A refusal answers with
 * {@link EGO_REFUSAL_MSG}, never an empty reply.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLoggingStream, samplingParams } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  CEREBRUM_DOMAIN,
  cerebrumTelemetryDeps,
} from '../ai-telemetry-deps.js';
import { resolveAnthropicApiKey } from '../anthropic-key.js';
import { effortParams } from '../llm-request.js';
import { egoStreamEvents } from './stream-events.js';

import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';
import type {
  ContentBlockParam,
  MessageParam,
  MessageStreamParams,
  Tool,
} from '@anthropic-ai/sdk/resources/messages/messages';

export const DEFAULT_EGO_MODEL = 'claude-sonnet-5-5';

// Thinking tokens count against max_tokens on a model that thinks, so the cap
// covers a full-length reply plus the thinking a low-effort turn can spend.
const CHAT_MAX_TOKENS = 8000;
const CHAT_TEMPERATURE = 0.3;
const CHAT_EFFORT = 'low';

const LLM_UNAVAILABLE_MSG =
  'I can help with that, but the LLM is currently unavailable. Please try again later.';
const LLM_ERROR_MSG = 'I encountered an error while generating a response. Please try again.';

export type EgoChatMessage = { role: 'user' | 'assistant'; content: string };

/** A message in the model's own request format, so tool blocks pass through untouched. */
export type EgoMessage = MessageParam;

/** A tool definition offered to the model for one turn. */
export interface EgoLlmTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

/** A tool call the model made in its final message. */
export interface EgoToolUse {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** One model call: the system prompt, the conversation so far and the tools on offer. */
export interface EgoTurnRequest {
  system: string;
  messages: EgoMessage[];
  tools?: EgoLlmTool[];
  toolChoice?: 'auto' | 'none';
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
  /** The final message's content array, untouched, to append as the assistant message of the next request. */
  assistantContent: ContentBlockParam[];
  /** Tool calls to run. Empty when the turn was refused or cut off. */
  toolUses: EgoToolUse[];
  stopReason: 'tool_use' | 'refusal' | 'max_tokens' | 'end';
}

export type EgoStreamEvent = EgoStreamChunk | EgoStreamDone;

/**
 * Capability the ego engine depends on. The real implementation degrades to
 * fallback events when no API key is configured, so a missing key never
 * throws.
 */
export interface EgoLlm {
  /** Resolve the configured chat model id (env override → default). */
  model(): string;
  /** Run one model call, yielding text tokens and then a terminal `done`. */
  stream(request: EgoTurnRequest): AsyncGenerator<EgoStreamEvent>;
}

function envModel(): string {
  const value = process.env['CEREBRUM_EGO_MODEL'];
  return value !== undefined && value !== '' ? value : DEFAULT_EGO_MODEL;
}

function toolParams(request: EgoTurnRequest): Pick<MessageStreamParams, 'tools' | 'tool_choice'> {
  if (request.tools === undefined || request.tools.length === 0) return {};
  const tools: Tool[] = request.tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: { ...tool.inputSchema, type: 'object' },
  }));
  return { tools, tool_choice: { type: request.toolChoice ?? 'auto' } };
}

function turnParams(model: string, request: EgoTurnRequest): MessageStreamParams {
  return {
    model,
    max_tokens: CHAT_MAX_TOKENS,
    ...samplingParams(model, CHAT_TEMPERATURE),
    ...effortParams(model, CHAT_EFFORT),
    system: request.system,
    messages: request.messages,
    ...toolParams(request),
  };
}

function* fallbackEvents(text: string): Generator<EgoStreamEvent> {
  yield { type: 'token', text };
  yield {
    type: 'done',
    fullText: text,
    tokensIn: 0,
    tokensOut: 0,
    assistantContent: [{ type: 'text', text }],
    toolUses: [],
    stopReason: 'end',
  };
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

  async *stream(request: EgoTurnRequest): AsyncGenerator<EgoStreamEvent> {
    const apiKey = resolveAnthropicApiKey();
    if (apiKey === undefined) {
      console.warn('[cerebrum-ego] ANTHROPIC_API_KEY not set — returning unavailable message');
      yield* fallbackEvents(LLM_UNAVAILABLE_MSG);
      return;
    }

    const client = new Anthropic({ apiKey, maxRetries: 0 });
    const model = this.model();
    let messageStream: MessageStream<unknown>;
    try {
      messageStream = client.messages.stream(turnParams(model, request));
    } catch (err) {
      console.warn(
        `[cerebrum-ego] stream creation failed: ${err instanceof Error ? err.message : String(err)}`
      );
      yield* fallbackEvents(LLM_ERROR_MSG);
      return;
    }

    yield* callWithLoggingStream(
      {
        provider: ANTHROPIC_PROVIDER,
        model,
        operation: 'ego.stream',
        domain: CEREBRUM_DOMAIN,
        stream: () => egoStreamEvents(messageStream),
        extractUsage: (last) =>
          last?.type === 'done'
            ? { inputTokens: last.tokensIn, outputTokens: last.tokensOut }
            : null,
      },
      cerebrumTelemetryDeps()
    );
  }
}
