/**
 * The real {@link ReceiptVision}, over Anthropic.
 *
 * Thin on purpose. Everything that decides whether a reading may be
 * believed lives in `extraction.ts`, `gate.ts` and `read-receipt.ts`, all
 * of which are pure and tested against fixtures — so this file has no
 * judgement in it to get wrong, only wiring.
 *
 * Usage, cost and latency go to the ai pillar through `@pops/ai-telemetry`,
 * like every other Claude call in the fleet, so a drop-zone that quietly
 * becomes expensive is visible in the same place as everything else.
 */
import Anthropic from '@anthropic-ai/sdk';

import { callWithLogging } from '@pops/ai-telemetry';

import {
  ANTHROPIC_PROVIDER,
  PURCHASES_DOMAIN,
  purchasesTelemetryDeps,
} from '../../api/ai-telemetry-deps.js';
import { resolveAnthropicApiKey } from '../../api/anthropic-key.js';
import { EXTRACTION_PROMPT } from './vision.js';

import type { ReceiptImage, ReceiptVision } from './vision.js';

/**
 * Reading a crumpled thermal receipt is the hard end of vision, so this is
 * not a place to economise on the model. The env override exists because
 * the right answer will change before this file does.
 */
export const DEFAULT_RECEIPT_MODEL = 'claude-sonnet-5';

/**
 * A receipt is a few hundred short lines at most. The ceiling is generous
 * enough that a long shop is never truncated mid-list — a truncated JSON
 * object fails to parse, which reads as "unusable output" rather than as
 * "the answer was too long", and would be a confusing thing to debug.
 */
const MAX_TOKENS = 8_000;

export function receiptModel(): string {
  const override = process.env['PURCHASES_RECEIPT_MODEL'];
  return override === undefined || override === '' ? DEFAULT_RECEIPT_MODEL : override;
}

/**
 * Build the production vision port, or `null` when no API key is
 * configured.
 *
 * Null rather than a throwing stub: the drop-zone should refuse an upload
 * with "vision is not configured" at the edge, not accept it and fail
 * per-image somewhere the user cannot see.
 */
export function createAnthropicVision(): ReceiptVision | null {
  const apiKey = resolveAnthropicApiKey();
  if (apiKey === undefined) return null;

  const client = new Anthropic({ apiKey });
  const model = receiptModel();

  return {
    async read(images: readonly ReceiptImage[]): Promise<string | null> {
      return callWithLogging(
        {
          domain: PURCHASES_DOMAIN,
          operation: 'receipt-extraction',
          provider: ANTHROPIC_PROVIDER,
          model,
          call: async () => {
            const message = await client.messages.create({
              model,
              max_tokens: MAX_TOKENS,
              // No `temperature`. Zero would say what this call wants —
              // transcription, not composition — but the current models
              // reject the parameter outright with a 400, which turns every
              // upload into an unreadable receipt. The prompt carries the
              // instruction instead, and the gate is what actually stops an
              // invented digit.
              messages: [
                {
                  role: 'user',
                  // Images first, in order, then the instruction: the model
                  // reads them as one receipt top to bottom, and the prompt
                  // is what tells it they overlap.
                  content: [
                    ...images.map((image) => ({
                      type: 'image' as const,
                      source: {
                        type: 'base64' as const,
                        media_type: image.mediaType,
                        data: image.dataBase64,
                      },
                    })),
                    { type: 'text' as const, text: EXTRACTION_PROMPT },
                  ],
                },
              ],
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
