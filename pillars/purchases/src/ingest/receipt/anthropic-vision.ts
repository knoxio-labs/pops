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
import { extractionPrompt, isImageMediaType } from './vision.js';

import type { ReceiptPart, ReceiptVision } from './vision.js';

/**
 * Reading a crumpled thermal receipt is the hard end of vision, so this is
 * not a place to economise on the model. The same model reads the PDFs and
 * pasted bodies, which are easier — splitting them onto a cheaper one would
 * buy very little and give the drop-zone two answers to explain. The env
 * override exists because the right answer will change before this file does.
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
 * One uploaded part → the content block that carries it.
 *
 * A PDF is a `document` block rather than something this pillar rasterises
 * or runs text extraction over: the model reads the file itself, which is
 * why the drop-zone grew PDF support without gaining a dependency.
 *
 * A pasted body travels as a `document` too, with a plain-text source,
 * rather than being concatenated into the instruction. Keeping it a document
 * is what preserves the distinction the whole prompt relies on — this is the
 * thing being read, not part of what is being asked.
 */
function toContentBlock(part: ReceiptPart): Anthropic.ContentBlockParam {
  if (isImageMediaType(part.mediaType)) {
    return {
      type: 'image',
      source: { type: 'base64', media_type: part.mediaType, data: part.dataBase64 },
    };
  }

  if (part.mediaType === 'application/pdf') {
    return {
      type: 'document',
      source: { type: 'base64', media_type: 'application/pdf', data: part.dataBase64 },
    };
  }

  return {
    type: 'document',
    source: {
      type: 'text',
      media_type: 'text/plain',
      // Stored and transported as bytes like every other part, so the
      // decode happens here — at the one boundary that needs characters.
      data: Buffer.from(part.dataBase64, 'base64').toString('utf8'),
    },
  };
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
    async read(parts: readonly ReceiptPart[]): Promise<string | null> {
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
                  // The receipt first, in the order it was sent, then the
                  // instruction: the model reads the parts as one document
                  // top to bottom, and the prompt is what tells it how the
                  // shapes it was given can mislead it.
                  content: [
                    ...parts.map(toContentBlock),
                    {
                      type: 'text' as const,
                      text: extractionPrompt(parts.map((part) => part.mediaType)),
                    },
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
