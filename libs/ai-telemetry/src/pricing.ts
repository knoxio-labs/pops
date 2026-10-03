import type { LookupPricingFn, PricingEntry } from './types.js';

const MISSING_PRICING_CACHE_TTL_MS = 60_000;

interface CachedPricing {
  expiresAt: number | undefined;
  promise: Promise<PricingEntry | null> | undefined;
}

/**
 * Identifies absent pricing, including a zero/zero entry from a provider row
 * whose rates defaulted to zero.
 */
export function isMissingPricing(pricing: PricingEntry | null): boolean {
  return pricing === null || (pricing.input === 0 && pricing.output === 0);
}

/**
 * Memoizes pricing lookups by provider and model. Priced entries stay cached
 * for the process lifetime; missing entries, including zero/zero entries,
 * expire after one minute.
 */
export function memoizePricing(lookup: LookupPricingFn): LookupPricingFn {
  const cache = new Map<string, CachedPricing>();

  return (provider, model) => {
    const key = `${provider} ${model}`;
    const cached = cache.get(key);
    if (cached?.promise && (cached.expiresAt === undefined || cached.expiresAt > Date.now())) {
      return cached.promise;
    }

    const entry: CachedPricing = { expiresAt: undefined, promise: undefined };
    const promise = lookup(provider, model).then((pricing) => {
      if (isMissingPricing(pricing) && cache.get(key) === entry) {
        entry.expiresAt = Date.now() + MISSING_PRICING_CACHE_TTL_MS;
      }
      return pricing;
    });
    entry.promise = promise;
    cache.set(key, entry);
    return promise;
  };
}
