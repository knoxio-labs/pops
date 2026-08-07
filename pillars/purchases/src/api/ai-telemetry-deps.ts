/**
 * `@pops/ai-telemetry` wiring for the receipt drop-zone.
 *
 * Built once per process: an `httpLookupPricing` adapter pointed at the ai
 * pillar, wrapped in a per-(provider, model) memo so a hundred-receipt
 * backfill does not re-read `GET /ai-pricing` a hundred times. Reporting is
 * fire-and-forget — a slow or absent sink never changes what a caller does.
 *
 * `report` is deliberately unset so `callWithLogging` falls back to the
 * env-driven sink, which no-ops under vitest when `AI_API_URL` and
 * `POPS_INTERNAL_CREDENTIAL` are unset. A test can therefore exercise the
 * real wrapper without a network.
 */
import {
  type CallWithLoggingDeps,
  httpLookupPricing,
  type LookupPricingFn,
  type PricingEntry,
} from '@pops/ai-telemetry';

export const PURCHASES_DOMAIN = 'purchases';
export const ANTHROPIC_PROVIDER = 'anthropic';

const DEFAULT_AI_API_URL = 'http://ai-api:3008';

function memoizePricing(lookup: LookupPricingFn): LookupPricingFn {
  const cache = new Map<string, Promise<PricingEntry | null>>();
  return (provider, model) => {
    const key = `${provider} ${model}`;
    let entry = cache.get(key);
    if (entry === undefined) {
      // A miss is cached too, so an unpriced model does not re-hit the ai
      // pillar on every single receipt.
      entry = lookup(provider, model);
      cache.set(key, entry);
    }
    return entry;
  };
}

let cached: CallWithLoggingDeps | undefined;

export function purchasesTelemetryDeps(): CallWithLoggingDeps {
  cached ??= {
    lookupPricing: memoizePricing(
      httpLookupPricing(process.env['AI_API_URL'] ?? DEFAULT_AI_API_URL)
    ),
  };
  return cached;
}
