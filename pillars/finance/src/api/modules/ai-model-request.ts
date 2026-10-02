import { supportsEffort } from '@pops/ai-telemetry';

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Smallest `max_tokens` sent to a model that thinks by default. Thinking tokens
 * count against `max_tokens`, so the 200-250 token caps sized for a bare JSON
 * reply would end the turn before any text block is produced.
 */
export const THINKING_MODEL_MAX_TOKENS_FLOOR = 2000;

/**
 * The `max_tokens` / `output_config` fragment of a Messages request. A model
 * that accepts `effort` gets `low` and a `max_tokens` of at least
 * {@link THINKING_MODEL_MAX_TOKENS_FLOOR}; a model that rejects it (Haiku 4.5)
 * gets exactly the cap it was given and no `output_config`.
 */
export function thinkingBudgetParams(
  model: string,
  maxTokens: number
): Pick<Anthropic.MessageCreateParamsNonStreaming, 'max_tokens' | 'output_config'> {
  if (!supportsEffort(model)) return { max_tokens: maxTokens };
  return {
    max_tokens: Math.max(maxTokens, THINKING_MODEL_MAX_TOKENS_FLOOR),
    output_config: { effort: 'low' },
  };
}
