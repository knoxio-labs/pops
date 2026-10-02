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
import { isVisionStop } from './vision.js';

import type { ExtractedReceipt } from './extraction.js';
import type { AdmissibleGate, InadmissibleGate } from './gate.js';
import type { ReceiptPart, ReceiptVision, VisionStop } from './vision.js';

export type ReadOutcome =
  /** The model read it and the arithmetic agrees. Admissible as fact. */
  | { readonly kind: 'read'; readonly extracted: ExtractedReceipt; readonly gate: AdmissibleGate }
  /** Read, but the figures disagree. A real purchase that needs a human. */
  | {
      readonly kind: 'needs-review';
      readonly extracted: ExtractedReceipt;
      readonly gate: InadmissibleGate;
    }
  /** Nothing usable came back. Not a purchase, and not a receipt with no items. */
  | { readonly kind: 'unreadable'; readonly reason: string }
  /** The answer was cut off at the token ceiling. Nothing was parsed. */
  | { readonly kind: 'truncated'; readonly reason: string }
  /** The model declined to answer. Nothing was parsed. */
  | { readonly kind: 'refused'; readonly reason: string }
  /** The API rejected the request itself; the same upload will be rejected again. */
  | { readonly kind: 'rejected'; readonly reason: string };

/** Every outcome that carries no reading, as the callers answer them. */
export type NoReadingOutcome = Extract<
  ReadOutcome,
  { kind: 'unreadable' | 'truncated' | 'refused' | 'rejected' }
>;

/**
 * Narrow an outcome to the ones with no reading. `cause` is what the wire
 * adds beside `unreadable` so a client can tell them apart; plain
 * `unreadable` has none.
 */
export function isNoReading(outcome: ReadOutcome): outcome is NoReadingOutcome {
  return (
    outcome.kind === 'unreadable' ||
    outcome.kind === 'truncated' ||
    outcome.kind === 'refused' ||
    outcome.kind === 'rejected'
  );
}

export function causeOf(outcome: NoReadingOutcome): {
  cause?: 'truncated' | 'refused' | 'rejected';
} {
  return outcome.kind === 'unreadable' ? {} : { cause: outcome.kind };
}

const STOP_OUTCOMES = {
  max_tokens: {
    kind: 'truncated',
    reason: 'the model ran out of room before finishing its answer, so nothing was read',
  },
  refusal: { kind: 'refused', reason: 'the model declined to read this upload' },
  rejected: { kind: 'rejected', reason: 'the vision service rejected this upload' },
} as const;

export async function readReceipt(
  vision: ReceiptVision,
  parts: readonly ReceiptPart[]
): Promise<ReadOutcome> {
  let raw: string | null | VisionStop;
  try {
    raw = await vision.read(parts);
  } catch (error) {
    // A transport failure is not a statement about the receipt. Saying so
    // keeps "the model was down" from being filed as "we read it and it
    // made no sense", which is the difference between retrying later and
    // asking the user to photograph it again.
    return { kind: 'unreadable', reason: `the vision model failed: ${messageOf(error)}` };
  }

  if (isVisionStop(raw)) {
    const outcome = STOP_OUTCOMES[raw.stopped];
    return { kind: outcome.kind, reason: `${outcome.reason}: ${raw.detail}` };
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
