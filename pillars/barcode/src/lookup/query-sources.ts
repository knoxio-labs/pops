import { barcodeErrorBody } from '../api/errors.js';
import { createLookupBudget, sourceAttempt } from './budget.js';
import { cacheOutcome } from './cache.js';
import { logProviderAttempt, type BarcodeLookupLogger } from './observability.js';
import { ProductSchema, type Product } from './product.js';

import type { LookupOutcome } from '../contract/rest-schemas.js';
import type { BarcodeDb } from '../db/index.js';
import type { BookSource } from './source.js';

type BarcodeUnavailableReason = 'provider_unavailable' | 'timeout';
type SourceResult =
  | { readonly kind: 'found'; readonly product: Product }
  | { readonly kind: 'miss' }
  | { readonly kind: 'unavailable'; readonly reason: BarcodeUnavailableReason };

interface SourceContext {
  readonly source: BookSource;
  readonly code: string;
  readonly requestId: string;
  readonly logger?: BarcodeLookupLogger;
  readonly budget: ReturnType<typeof createLookupBudget>;
}

interface QuerySourcesOptions {
  readonly db: BarcodeDb;
  readonly sources: readonly BookSource[];
  readonly code: string;
  readonly requestedAt: Date;
  readonly requestId: string;
  readonly logger?: BarcodeLookupLogger;
}

function unavailableOutcome(
  reason: BarcodeUnavailableReason,
  requestId: string
): Extract<LookupOutcome, { outcome: 'unavailable' }> {
  return {
    outcome: 'unavailable',
    error: barcodeErrorBody(reason === 'timeout' ? 'timeout' : 'provider_unavailable', requestId),
  };
}

function mergeUnavailableReason(
  current: BarcodeUnavailableReason | undefined,
  result: SourceResult
): BarcodeUnavailableReason | undefined {
  if (result.kind !== 'unavailable') return current;
  if (result.reason === 'timeout') return 'timeout';
  return current ?? result.reason;
}

function logUnavailable(
  context: SourceContext,
  startedAt: number,
  failureClass: Parameters<typeof logProviderAttempt>[1]['failureClass'],
  providerStatus?: number
): void {
  logProviderAttempt(context.logger, {
    requestId: context.requestId,
    source: context.source.id,
    outcome: 'unavailable',
    durationMs: Date.now() - startedAt,
    ...(failureClass === undefined ? {} : { failureClass }),
    ...(providerStatus === undefined ? {} : { providerStatus }),
  });
}

async function querySource(context: SourceContext): Promise<SourceResult> {
  const startedAt = Date.now();
  const attempt = await sourceAttempt(context.source, context.code, context.budget);
  if (attempt.kind === 'timeout') {
    logUnavailable(context, startedAt, 'timeout');
    return { kind: 'unavailable', reason: 'timeout' };
  }
  if (context.budget.signal.aborted) return { kind: 'unavailable', reason: 'timeout' };
  if (attempt.answer.kind === 'unavailable') {
    const failureClass = attempt.answer.failureClass ?? 'provider_unavailable';
    logUnavailable(context, startedAt, failureClass, attempt.answer.status);
    return {
      kind: 'unavailable',
      reason: failureClass === 'timeout' ? 'timeout' : 'provider_unavailable',
    };
  }
  if (attempt.answer.kind === 'miss') {
    logProviderAttempt(context.logger, {
      requestId: context.requestId,
      source: context.source.id,
      outcome: 'miss',
      durationMs: Date.now() - startedAt,
    });
    return { kind: 'miss' };
  }

  const parsed = ProductSchema.safeParse(attempt.answer.product);
  if (!parsed.success) {
    logUnavailable(context, startedAt, 'invalid_product');
    return { kind: 'unavailable', reason: 'provider_unavailable' };
  }
  logProviderAttempt(context.logger, {
    requestId: context.requestId,
    source: context.source.id,
    outcome: 'hit',
    durationMs: Date.now() - startedAt,
  });
  return { kind: 'found', product: parsed.data };
}

/** Query ordered providers under one shared lookup budget. */
export async function querySources(options: QuerySourcesOptions): Promise<LookupOutcome> {
  const budget = createLookupBudget();
  let unavailableReason: BarcodeUnavailableReason | undefined;
  try {
    for (const source of options.sources) {
      if (budget.signal.aborted) return unavailableOutcome('timeout', options.requestId);
      const result = await querySource({
        source,
        code: options.code,
        requestId: options.requestId,
        budget,
        ...(options.logger === undefined ? {} : { logger: options.logger }),
      });
      if (result.kind === 'found') {
        const outcome = { outcome: 'found' as const, product: result.product };
        cacheOutcome(options.db, options.code, outcome, options.requestedAt);
        return outcome;
      }
      unavailableReason = mergeUnavailableReason(unavailableReason, result);
    }
    if (unavailableReason !== undefined) {
      return unavailableOutcome(unavailableReason, options.requestId);
    }
    const outcome = { outcome: 'not_found' as const };
    cacheOutcome(options.db, options.code, outcome, options.requestedAt);
    return outcome;
  } finally {
    budget.cancel();
  }
}
