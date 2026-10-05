/**
 * Shared fixtures for the LLM adapter request-shape tests: canned Messages
 * responses, a fake `MessageStream`, and a telemetry sink that keeps the
 * `@pops/ai-telemetry` wrapper off the network.
 */
import { __setCerebrumTelemetryDepsForTests } from '../ai-telemetry-deps.js';

import type { InferenceRecord } from '@pops/ai-telemetry';

export const CURRENT_MODEL = 'claude-sonnet-5-5';
export const HAIKU_MODEL = 'claude-haiku-4-5-20251001';
export const LEGACY_SONNET_MODEL = 'claude-sonnet-4-6';

const USAGE = { input_tokens: 20, output_tokens: 9 };

type Block = { type: 'text'; text: string } | { type: 'thinking'; thinking: string };

interface FakeMessage {
  content: Block[];
  stop_reason: 'end_turn' | 'max_tokens' | 'refusal';
  stop_details: { type: 'refusal'; category: string; explanation: string | null } | null;
  usage: typeof USAGE;
}

/** A completed response whose only block is `text`. */
export function textMessage(text: string): FakeMessage {
  return {
    content: [{ type: 'text', text }],
    stop_reason: 'end_turn',
    stop_details: null,
    usage: USAGE,
  };
}

/** A response from a thinking model: the `thinking` block comes first. */
export function thinkingThenTextMessage(text: string): FakeMessage {
  return {
    content: [
      { type: 'thinking', thinking: 'weighing the sources' },
      { type: 'text', text },
    ],
    stop_reason: 'end_turn',
    stop_details: null,
    usage: USAGE,
  };
}

/** A refusal: HTTP 200 with whatever partial content the model emitted. */
export function refusalMessage(partialText = ''): FakeMessage {
  return {
    content: partialText === '' ? [] : [{ type: 'text', text: partialText }],
    stop_reason: 'refusal',
    stop_details: { type: 'refusal', category: 'general_harms', explanation: null },
    usage: USAGE,
  };
}

/** A response cut off at the output-token cap. */
export function cutOffMessage(text: string): FakeMessage {
  return { ...textMessage(text), stop_reason: 'max_tokens' };
}

interface TextDeltaEvent {
  type: 'content_block_delta';
  delta: { type: 'text_delta'; text: string };
}

/** A fake Anthropic `MessageStream`: text deltas, then the final message. */
export function fakeMessageStream(
  deltas: string[],
  finalMessage: FakeMessage
): AsyncIterable<TextDeltaEvent> & { finalMessage: () => Promise<FakeMessage> } {
  return {
    async *[Symbol.asyncIterator](): AsyncIterator<TextDeltaEvent> {
      for (const text of deltas) {
        yield { type: 'content_block_delta', delta: { type: 'text_delta', text } };
      }
    },
    finalMessage: () => Promise.resolve(finalMessage),
  };
}

/** Route telemetry to a no-op sink so the wrapper never reaches the ai pillar. */
export function silenceTelemetry(): void {
  __setCerebrumTelemetryDepsForTests({
    lookupPricing: () => Promise.resolve(null),
    report: () => Promise.resolve(),
  });
}

/** Capture the next record reported through cerebrum's telemetry wrapper. */
export function captureTelemetryRecord(): Promise<InferenceRecord> {
  return new Promise((resolve) => {
    __setCerebrumTelemetryDepsForTests({
      lookupPricing: () => Promise.resolve(null),
      report: (record) => {
        resolve(record);
        return Promise.resolve();
      },
    });
  });
}

/** Restore the real telemetry deps. */
export function restoreTelemetry(): void {
  __setCerebrumTelemetryDepsForTests(null);
}

/** Drain an async generator into an array. */
export async function collect<T>(source: AsyncIterable<T>): Promise<T[]> {
  const items: T[] = [];
  for await (const item of source) items.push(item);
  return items;
}
