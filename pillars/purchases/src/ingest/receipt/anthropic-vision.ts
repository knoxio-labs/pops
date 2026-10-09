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
import { normaliseForVision } from './normalise-for-vision.js';
import { extractionPrompt, isImageMediaType } from './vision.js';

import type { ReceiptPart, ReceiptVision, VisionStop } from './vision.js';

/**
 * Reading a crumpled thermal receipt is the hard end of vision, so this is
 * not a place to economise on the model. The same model reads the PDFs and
 * pasted bodies, which are easier — splitting them onto a cheaper one would
 * buy very little and give the drop-zone two answers to explain. The env
 * override exists because the right answer will change before this file does.
 */
export const DEFAULT_RECEIPT_MODEL = 'claude-sonnet-5-5';

/**
 * Adaptive thinking is on for this model and its tokens count against this
 * ceiling, so it covers the thinking as well as the JSON. A cut-off answer
 * is reported as such (`stop_reason: 'max_tokens'`), never parsed.
 */
const MAX_TOKENS = 16_000;

// A 400 is also how the API reports an exhausted credit balance. That is the
// account's fault, not the upload's: the same receipt reads fine once it is
// topped up, so it stays on the failure path that invites a retry.
const ACCOUNT_REJECTION = /credit balance/i;

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
 *
 * Every media type is named. The `never` below is what makes adding one to
 * `MEDIA_TYPES` a compile error here rather than a new file type quietly
 * reaching the model as plain text.
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

  if (part.mediaType === 'text/plain') {
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

  const unhandled: never = part.mediaType;
  throw new Error(`no content block is defined for media type ${String(unhandled)}`);
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
    async read(parts: readonly ReceiptPart[]): Promise<string | null | VisionStop> {
      const forModel = await normaliseForVision(parts);
      try {
        return await callWithLogging(
          {
            domain: PURCHASES_DOMAIN,
            operation: 'receipt-extraction',
            provider: ANTHROPIC_PROVIDER,
            model,
            call: async () => {
              const message = await client.messages.create({
                model,
                max_tokens: MAX_TOKENS,
                // This model rejects `temperature`, `thinking: disabled` and
                // a forced `tool_choice` with a 400, and thinks adaptively
                // unless told otherwise. Effort is the one dial, and it
                // defaults to `high`, more than transcription needs.
                output_config: { effort: 'medium' },
                messages: [
                  {
                    role: 'user',
                    // The receipt first, in the order it was sent, then the
                    // instruction: the model reads the parts as one document
                    // top to bottom, and the prompt is what tells it how the
                    // shapes it was given can mislead it.
                    content: [
                      ...forModel.map(toContentBlock),
                      {
                        type: 'text' as const,
                        text: extractionPrompt(forModel.map((part) => part.mediaType)),
                      },
                    ],
                  },
                ],
              });

              return {
                response: readingOf(message),
                usage: {
                  inputTokens: message.usage.input_tokens,
                  outputTokens: message.usage.output_tokens,
                },
                ...(message.stop_reason !== null ? { stopReason: message.stop_reason } : {}),
              };
            },
          },
          purchasesTelemetryDeps()
        );
      } catch (error) {
        if (error instanceof Anthropic.BadRequestError && !ACCOUNT_REJECTION.test(error.message)) {
          return { stopped: 'rejected', detail: error.message };
        }
        throw error;
      }
    },
  };
}

function readingOf(message: Anthropic.Message): string | null | VisionStop {
  if (message.stop_reason === 'max_tokens') {
    return { stopped: 'max_tokens', detail: `stopped at ${MAX_TOKENS} tokens` };
  }
  if (message.stop_reason === 'refusal') {
    return { stopped: 'refusal', detail: 'stop_reason refusal' };
  }
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return text === '' ? null : text;
}
