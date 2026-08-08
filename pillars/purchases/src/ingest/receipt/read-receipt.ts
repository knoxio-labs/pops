/**
 * Receipt in, decision out.
 *
 * Three steps, deliberately separable: ask the model, parse what it said,
 * check the arithmetic. Only the first needs a network, which is why it is
 * a port — everything that decides whether a reading may be believed is
 * pure and tested against fixtures. Nothing below the port knows whether
 * the receipt arrived as a photograph, a PDF or a pasted body.
 *
 * There is no retry-until-it-sums loop. Re-rolling until the arithmetic
 * agrees selects for readings that pass the gate rather than readings that
 * are right, which is exactly the property the gate exists to provide.
 */
import { ExtractionShapeError, parseExtraction } from './extraction.js';
import { gateExtraction } from './gate.js';

import type { ExtractedReceipt } from './extraction.js';
import type { GateResult } from './gate.js';
import type { ReceiptPart, ReceiptVision } from './vision.js';

export type ReadOutcome =
  /** The model read it and the arithmetic agrees. Admissible as fact. */
  | { readonly kind: 'read'; readonly extracted: ExtractedReceipt; readonly gate: GateResult }
  /** Read, but the figures disagree. A real purchase that needs a human. */
  | {
      readonly kind: 'needs-review';
      readonly extracted: ExtractedReceipt;
      readonly gate: GateResult;
    }
  /** Nothing usable came back. Not a purchase, and not a receipt with no items. */
  | { readonly kind: 'unreadable'; readonly reason: string };

export async function readReceipt(
  vision: ReceiptVision,
  parts: readonly ReceiptPart[]
): Promise<ReadOutcome> {
  let raw: string | null;
  try {
    raw = await vision.read(parts);
  } catch (error) {
    // A transport failure is not a statement about the receipt. Saying so
    // keeps "the model was down" from being filed as "we read it and it
    // made no sense", which is the difference between retrying later and
    // asking the user to photograph it again.
    return { kind: 'unreadable', reason: `the vision model failed: ${messageOf(error)}` };
  }

  if (raw === null || raw.trim() === '') {
    return { kind: 'unreadable', reason: 'the vision model returned nothing' };
  }

  let extracted: ExtractedReceipt;
  try {
    extracted = parseExtraction(raw);
  } catch (error) {
    if (error instanceof ExtractionShapeError) {
      return { kind: 'unreadable', reason: error.message };
    }
    throw error;
  }

  const gate = gateExtraction(extracted);
  return gate.admissible
    ? { kind: 'read', extracted, gate }
    : { kind: 'needs-review', extracted, gate };
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
