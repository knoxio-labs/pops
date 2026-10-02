import { supportsEffort } from '@pops/ai-telemetry';

import type Anthropic from '@anthropic-ai/sdk';

type Effort = NonNullable<Anthropic.Messages.OutputConfig['effort']>;

/**
 * The effort fragment of a Messages request: `{ output_config: { effort } }`
 * for a model that accepts it, `{}` otherwise. Spread it into the request so
 * one call site stays valid across a model override.
 */
export function effortParams(
  model: string,
  effort: Effort
): Pick<Anthropic.Messages.MessageCreateParams, 'output_config'> {
  return supportsEffort(model) ? { output_config: { effort } } : {};
}

/**
 * Whether the model declined the request. A refusal is an HTTP 200 whose
 * content is empty or partial, so it has to be checked before the content is
 * read. Logs the policy category under `context` when the API supplies one.
 */
export function isRefusal(
  message: Pick<Anthropic.Messages.Message, 'stop_reason' | 'stop_details'>,
  context: string
): boolean {
  if (message.stop_reason !== 'refusal') return false;
  const category = message.stop_details?.category ?? 'unspecified';
  console.warn(`[${context}] model declined the request (category: ${category})`);
  return true;
}

/** Whether the output hit `max_tokens` and was cut off mid-generation. */
export function isOutputTruncated(
  message: Pick<Anthropic.Messages.Message, 'stop_reason'>
): boolean {
  return message.stop_reason === 'max_tokens';
}
