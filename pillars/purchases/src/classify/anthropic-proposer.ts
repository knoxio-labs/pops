/**
 * The real {@link ItemKindProposer}, over Anthropic.
 *
 * Thin on purpose, like the receipt vision adapter it mirrors. Everything
 * that decides what may be believed lives in `kind-proposal.ts`, which is
 * pure and fixture-tested, so this file has no judgement in it to get
 * wrong.
 *
 * Usage, cost and latency go to the ai pillar through `@pops/ai-telemetry`,
 * so a classification sweep that quietly becomes expensive shows up in the
 * same place as every other Claude call on the fleet.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  PURCHASES_DOMAIN,
  purchasesTelemetryDeps,
} from '../api/ai-telemetry-deps.js';
import { resolveAnthropicApiKey } from '../api/anthropic-key.js';
import { kindPrompt } from './kind-proposal.js';

import type { ProposalCandidate } from './batch.js';
import type { ItemKindProposer } from './propose-item-kind.js';

/**
 * Naming a product from its name is a much easier job than reading a
 * crumpled thermal receipt, and there are thousands of lines to get
 * through, so this runs on the small model rather than the one the
 * drop-zone uses. The override exists because the right answer will change
 * before this file does.
 */
export const DEFAULT_ITEM_KIND_MODEL = 'claude-haiku-4-5';

/**
 * A batch is a list of short product names in and a list of enum values
 * out, so the reply is small. The ceiling is generous enough that the
 * largest batch cannot be truncated mid-array — truncated JSON reads as
 * "unusable output" rather than "the answer was too long", which is a
 * confusing thing to debug.
 */
const MAX_TOKENS = 4_000;

export function itemKindModel(): string {
  const override = process.env['PURCHASES_ITEM_KIND_MODEL'];
  return override === undefined || override === '' ? DEFAULT_ITEM_KIND_MODEL : override;
}

/**
 * Build the production proposer, or `null` when no API key is configured.
 *
 * Null rather than a throwing stub: a caller with no key should be told
 * that before it starts a sweep, not per batch somewhere nobody is looking.
 */
export function createAnthropicItemKindProposer(): ItemKindProposer | null {
  const apiKey = resolveAnthropicApiKey();
  if (apiKey === undefined) return null;

  const client = new Anthropic({ apiKey });
  const model = itemKindModel();

  return {
    async propose(candidates: readonly ProposalCandidate[]): Promise<string | null> {
      return callWithLogging(
        {
          domain: PURCHASES_DOMAIN,
          operation: 'item-kind-proposal',
          provider: ANTHROPIC_PROVIDER,
          model,
          call: async () => {
            const message = await client.messages.create({
              model,
              max_tokens: MAX_TOKENS,
              messages: [{ role: 'user', content: kindPrompt(candidates) }],
            });

            const text = message.content
              .filter((block) => block.type === 'text')
              .map((block) => block.text)
              .join('');

            return {
              response: text === '' ? null : text,
              usage: {
                inputTokens: message.usage.input_tokens,
                outputTokens: message.usage.output_tokens,
              },
            };
          },
        },
        purchasesTelemetryDeps()
      );
    },
  };
}
