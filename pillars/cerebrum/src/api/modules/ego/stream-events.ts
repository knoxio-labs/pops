import { isRefusal } from '../llm-request.js';

import type { MessageStream } from '@anthropic-ai/sdk/lib/MessageStream';

/**
 * Adapts an Anthropic {@link MessageStream} into the ego SSE event shape. Kept
 * in its own module so the ego LLM port stays focused on the {@link EgoLlm}
 * implementation; this is the generator the telemetry wrapper drives.
 */
import type { EgoStreamEvent } from './llm.js';

/** Display-safe text emitted when stream processing fails mid-flight. */
export const EGO_STREAM_ERROR_MSG =
  'I encountered an error while generating a response. Please try again.';

/** Display-safe text emitted when the model declines the request. */
export const EGO_REFUSAL_MSG = "I can't help with that request. The model declined to answer it.";

/**
 * Drains an Anthropic {@link MessageStream} into the ego event shape: a `token`
 * event per text delta, then a terminal `done` carrying the final token usage.
 * A refusal is only known from the final message, so {@link EGO_REFUSAL_MSG}
 * is emitted as a closing token after whatever partial text already streamed.
 * A mid-stream processing error degrades to a fallback `done` (tokens 0) rather
 * than throwing, preserving the engine's display-safe contract; the telemetry
 * wrapper reads usage from whichever `done` event terminates the stream.
 */
export async function* egoStreamEvents(
  messageStream: MessageStream
): AsyncGenerator<EgoStreamEvent> {
  let fullText = '';
  try {
    for await (const event of messageStream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        yield { type: 'token', text: event.delta.text };
      }
    }
    const finalMessage = await messageStream.finalMessage();
    if (isRefusal(finalMessage, 'cerebrum-ego')) {
      const notice = fullText.length > 0 ? `\n\n${EGO_REFUSAL_MSG}` : EGO_REFUSAL_MSG;
      fullText += notice;
      yield { type: 'token', text: notice };
    }
    yield {
      type: 'done',
      fullText,
      tokensIn: finalMessage.usage.input_tokens,
      tokensOut: finalMessage.usage.output_tokens,
    };
  } catch (err) {
    console.warn(
      `[cerebrum-ego] stream processing failed: ${err instanceof Error ? err.message : String(err)}`
    );
    if (fullText.length === 0) {
      yield { type: 'token', text: EGO_STREAM_ERROR_MSG };
      fullText = EGO_STREAM_ERROR_MSG;
    }
    yield { type: 'done', fullText, tokensIn: 0, tokensOut: 0 };
  }
}
