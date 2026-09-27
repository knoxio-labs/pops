import { eq } from 'drizzle-orm';

import { lookupCache, type BarcodeDb } from '../db/index.js';
import { isProductComplete, ProductSchema, type Product } from './product.js';

import type { LookupOutcome } from '../contract/rest-schemas.js';

/** Cache lifetime for a successful product lookup. */
export const FOUND_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Cache lifetime for a definitive source miss. */
export const NOT_FOUND_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

const CACHE_VERSION = 2;

function expired(expiresAt: string, now: Date): boolean {
  const timestamp = Date.parse(expiresAt);
  return !Number.isFinite(timestamp) || timestamp <= now.getTime();
}

function cachedOutcome(row: typeof lookupCache.$inferSelect): LookupOutcome | undefined {
  if (row.cacheVersion !== CACHE_VERSION) return undefined;
  if (row.outcome === 'not_found') return { outcome: 'not_found' };
  if (row.productJson === null) return undefined;

  try {
    const parsed: unknown = JSON.parse(row.productJson);
    const product = ProductSchema.safeParse(parsed);
    return product.success && isProductComplete(product.data)
      ? { outcome: 'found', product: product.data }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Read one live, valid cached lookup outcome. */
export function readCachedOutcome(
  db: BarcodeDb,
  code: string,
  now: Date
): LookupOutcome | undefined {
  const cached = db.select().from(lookupCache).where(eq(lookupCache.code, code)).get();
  if (cached === undefined || expired(cached.expiresAt, now)) return undefined;
  return cachedOutcome(cached);
}

/** Store a definitive found or not-found lookup outcome. */
export function cacheOutcome(
  db: BarcodeDb,
  code: string,
  outcome: Extract<LookupOutcome, { outcome: 'found' | 'not_found' }>,
  fetchedAt: Date
): void {
  if (outcome.outcome === 'found' && !isProductComplete(outcome.product)) {
    db.delete(lookupCache).where(eq(lookupCache.code, code)).run();
    return;
  }
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
      cacheVersion: CACHE_VERSION,
      fetchedAt: fetchedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    .onConflictDoUpdate({
      target: lookupCache.code,
      set: {
        outcome: outcome.outcome,
        productJson: product === null ? null : JSON.stringify(product),
        source: product?.source ?? null,
        cacheVersion: CACHE_VERSION,
        fetchedAt: fetchedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    })
    .run();
}
