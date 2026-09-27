import { getRequestId, mintRequestId } from '@pops/pillar-sdk/server';

import { readCachedOutcome } from './cache.js';
import { normaliseBarcode } from './normalise.js';
import { logLookupOutcome, type BarcodeLookupLogger } from './observability.js';
import { querySources } from './query-sources.js';

import type { LookupOutcome } from '../contract/rest-schemas.js';
import type { BarcodeDb } from '../db/index.js';
import type { BookSource } from './source.js';

export { LOOKUP_BUDGET_MS, SOURCE_BUDGET_MS } from './budget.js';
export { FOUND_CACHE_TTL_MS, NOT_FOUND_CACHE_TTL_MS } from './cache.js';
export type { BarcodeLookupLogger } from './observability.js';

/** Dependencies for the barcode lookup policy. */
export interface BarcodeLookupServiceOptions {
  readonly db: BarcodeDb;
  readonly sources: readonly BookSource[];
  readonly now?: () => Date;
  readonly logger?: BarcodeLookupLogger;
}

/** Service surface consumed by the HTTP handler and injectable in tests. */
export interface BarcodeLookupService {
  lookup(code: string): Promise<LookupOutcome>;
}

/**
 * Create the ordered, cache-backed barcode lookup policy.
 *
 * The adapters share one eight-second signal. A miss permits the next source;
 * an unavailable source is remembered and only becomes the final outcome when
 * no later source returns a valid product. Unavailable outcomes never enter
 * the cache.
 */
export function createBarcodeLookupService(
  options: BarcodeLookupServiceOptions
): BarcodeLookupService {
  const now = options.now ?? (() => new Date());

  return {
    async lookup(rawCode: string): Promise<LookupOutcome> {
      const requestId = getRequestId() ?? mintRequestId();
      const startedAt = Date.now();
      const normalised = normaliseBarcode(rawCode);
      const requestedAt = now();

      if (normalised.kind === 'unsupported') {
        const result = { outcome: 'not_found' as const, reason: 'unsupported' as const };
        logLookupOutcome(options.logger, requestId, startedAt, result);
        return result;
      }

      const cached = readCachedOutcome(options.db, normalised.code, requestedAt);
      if (cached !== undefined) {
        logLookupOutcome(options.logger, requestId, startedAt, cached);
        return cached;
      }

      const result = await querySources({
        db: options.db,
        sources: options.sources,
        code: normalised.code,
        requestedAt,
        requestId,
        ...(options.logger === undefined ? {} : { logger: options.logger }),
      });
      logLookupOutcome(options.logger, requestId, startedAt, result);
      return result;
    },
  };
}

/** Short factory name for callers that already work inside the barcode pillar. */
export function createLookupService(options: BarcodeLookupServiceOptions): BarcodeLookupService {
  return createBarcodeLookupService(options);
}

export { InvalidBarcodeError } from './normalise.js';
export type { LookupOutcome } from '../contract/rest-schemas.js';
