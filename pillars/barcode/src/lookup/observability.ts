import type { LookupOutcome } from '../contract/rest-schemas.js';
import type { BookSource, SourceFailureClass } from './source.js';

/** Structured logger for privacy-safe barcode lookup events. */
export interface BarcodeLookupLogger {
  info(message: string, context: Readonly<Record<string, unknown>>): void;
}

/** Record one provider attempt without its barcode, payload, or exception. */
export function logProviderAttempt(
  logger: BarcodeLookupLogger | undefined,
  context: {
    readonly requestId: string;
    readonly source: BookSource['id'];
    readonly outcome: 'hit' | 'miss' | 'unavailable';
    readonly durationMs: number;
    readonly failureClass?: SourceFailureClass | 'invalid_product' | 'provider_unavailable';
    readonly providerStatus?: number;
  }
): void {
  logger?.info('barcode provider attempt', context);
}

/** Record the final safe lookup outcome for one request. */
export function logLookupOutcome(
  logger: BarcodeLookupLogger | undefined,
  requestId: string,
  startedAt: number,
  outcome: LookupOutcome
): void {
  const context: Record<string, unknown> = {
    requestId,
    outcome: outcome.outcome,
    durationMs: Date.now() - startedAt,
  };
  if (outcome.outcome === 'found') context.source = outcome.product.source;
  if (outcome.outcome === 'not_found' && outcome.reason !== undefined) {
    context.reason = outcome.reason;
  }
  if (outcome.outcome === 'unavailable' && outcome.error !== undefined) {
    context.failureClass = outcome.error.code;
    context.retryable = outcome.error.retryable;
  }
  logger?.info('barcode lookup outcome', context);
}
