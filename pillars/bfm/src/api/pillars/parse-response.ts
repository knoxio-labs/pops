/**
 * Folding a successful gateway outcome through the shape the producer was
 * expected to answer with.
 *
 * `pillar<TRouter>()` is typed by the CALLER — the SDK proxy resolves routes
 * from the producer's live OpenAPI — so a local router type is an assertion,
 * not a check. This is where the actual guarantee lives, for every leg: a
 * producer-side rename would otherwise arrive as `undefined` and reach a phone
 * screen as a blank, a zero, or a purchase that says it created nothing.
 *
 * A response bfm cannot read is a `contract-mismatch`, the same kind the
 * gateway raises when a peer serves no callable contract at all, and
 * deliberately NOT `unavailable`: the peer answered, so retrying produces the
 * same answer, and telling the phone to retry spins it against a fault only a
 * deploy can fix.
 */
import { isGatewayOk, type GatewayOutcome } from './gateway.js';

import type { z } from 'zod';

/**
 * @param pillarId The peer that answered, for the failure and the log line.
 * @param outcome What the gateway returned. A failure passes straight through.
 * @param schema The shape the caller can read.
 * @param operation Dotted operation id (`transactions.list`), for the message.
 */
export function parseOrMismatch<TValue>(
  pillarId: string,
  outcome: GatewayOutcome<unknown>,
  schema: z.ZodType<TValue>,
  operation: string
): GatewayOutcome<TValue> {
  if (!isGatewayOk(outcome)) return outcome;

  const result = schema.safeParse(outcome.value);
  if (!result.success) {
    console.warn(
      `[bfm-api] ${pillarId}.${operation} returned a shape this pillar cannot read: ${result.error.message}`
    );
    return {
      kind: 'contract-mismatch',
      pillar: pillarId,
      status: 502,
      detail: `${operation} response did not match the expected shape`,
    };
  }

  return { kind: 'ok', value: result.data };
}
