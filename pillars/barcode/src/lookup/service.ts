import { eq } from 'drizzle-orm';

import { lookupCache, type BarcodeDb } from '../db/index.js';
import { createLookupBudget, sourceAttempt } from './budget.js';
import { normaliseBarcode } from './normalise.js';
import { ProductSchema, type Product } from './product.js';

import type { LookupOutcome } from '../contract/rest-schemas.js';
import type { BookSource } from './source.js';

export { LOOKUP_BUDGET_MS, SOURCE_BUDGET_MS } from './budget.js';

/** Cache lifetime for a successful product lookup. */
export const FOUND_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Cache lifetime for a definitive source miss. */
export const NOT_FOUND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Dependencies for the barcode lookup policy. */
export interface BarcodeLookupServiceOptions {
  readonly db: BarcodeDb;
  readonly sources: readonly BookSource[];
  readonly now?: () => Date;
}

/** Service surface consumed by the HTTP handler and injectable in tests. */
export interface BarcodeLookupService {
  lookup(code: string): Promise<LookupOutcome>;
}

function expired(expiresAt: string, now: Date): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

function cachedOutcome(row: typeof lookupCache.$inferSelect): LookupOutcome | undefined {
  if (row.outcome === 'not_found') return { outcome: 'not_found' };
  if (row.productJson === null) return undefined;

  try {
    const parsed: unknown = JSON.parse(row.productJson);
    const product = ProductSchema.safeParse(parsed);
    return product.success ? { outcome: 'found', product: product.data } : undefined;
  } catch {
    return undefined;
  }
}

function cacheOutcome(
  db: BarcodeDb,
  code: string,
  outcome: Extract<LookupOutcome, { outcome: 'found' | 'not_found' }>,
  fetchedAt: Date
): void {
  const expiresAt = new Date(
    fetchedAt.getTime() +
      (outcome.outcome === 'found' ? FOUND_CACHE_TTL_MS : NOT_FOUND_CACHE_TTL_MS)
  );
  const product: Product | null = outcome.outcome === 'found' ? outcome.product : null;

  db.insert(lookupCache)
    .values({
      code,
      outcome: outcome.outcome,
      productJson: product === null ? null : JSON.stringify(product),
      source: product?.source ?? null,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    .onConflictDoUpdate({
      target: lookupCache.code,
      set: {
        outcome: outcome.outcome,
        productJson: product === null ? null : JSON.stringify(product),
        source: product?.source ?? null,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    })
    .run();
}

async function querySources(
  db: BarcodeDb,
  sources: readonly BookSource[],
  code: string,
  requestedAt: Date
): Promise<LookupOutcome> {
  const budget = createLookupBudget();
  const { signal } = budget;
  let unavailable = false;

  try {
    for (const source of sources) {
      if (signal.aborted) return { outcome: 'unavailable' };

      const attempt = await sourceAttempt(source, code, budget);
      if (attempt.kind === 'timeout' && attempt.scope === 'lookup') {
        return { outcome: 'unavailable' };
      }
      if (attempt.kind === 'timeout') {
        unavailable = true;
        continue;
      }
      if (signal.aborted) return { outcome: 'unavailable' };
      if (attempt.answer.kind === 'unavailable') {
        unavailable = true;
        continue;
      }
      if (attempt.answer.kind === 'miss') continue;

      const parsed = ProductSchema.safeParse(attempt.answer.product);
      if (!parsed.success) {
        unavailable = true;
        continue;
      }

      const result = { outcome: 'found' as const, product: parsed.data };
      cacheOutcome(db, code, result, requestedAt);
      return result;
    }

    if (unavailable) return { outcome: 'unavailable' };

    const result = { outcome: 'not_found' as const };
    cacheOutcome(db, code, result, requestedAt);
    return result;
  } finally {
    budget.cancel();
  }
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
      const normalised = normaliseBarcode(rawCode);
      const requestedAt = now();
      const cached = options.db
        .select()
        .from(lookupCache)
        .where(eq(lookupCache.code, normalised.code))
        .get();

      if (cached !== undefined && !expired(cached.expiresAt, requestedAt)) {
        const result = cachedOutcome(cached);
        if (result !== undefined) return result;
      }

      if (normalised.kind === 'unsupported') {
        const result = { outcome: 'not_found' as const };
        cacheOutcome(options.db, normalised.code, result, requestedAt);
        return result;
      }

      return querySources(options.db, options.sources, normalised.code, requestedAt);
    },
  };
}

/** Short factory name for callers that already work inside the barcode pillar. */
export function createLookupService(options: BarcodeLookupServiceOptions): BarcodeLookupService {
  return createBarcodeLookupService(options);
}

export { InvalidBarcodeError } from './normalise.js';
export type { LookupOutcome } from '../contract/rest-schemas.js';
