/**
 * Shared `@pops/ai-telemetry` dependency wiring for food's worker Claude callers.
 *
 * Every food worker call site routes through `callWithLogging`, reporting
 * usage/cost/latency to the ai pillar's `POST /ai-usage/record`. The deps are
 * built once per process: an `httpLookupPricing` adapter pointed at the ai
 * pillar, wrapped in a per-(provider, model) memo so repeated inferences do not
 * re-hit `GET /ai-pricing` on every call, and an explicit `report` sink so a
 * record the ai pillar refuses is logged rather than dropped (POPS-2332).
 * Reporting is fire-and-forget — a slow or absent sink never alters the
 * caller's behaviour.
 */
import {
  type CallWithLoggingDeps,
  createEnvReportSink,
  httpLookupPricing,
  type LookupPricingFn,
  type PricingEntry,
} from '@pops/ai-telemetry';

import { ledgerReportFailedMessage, resolveLedgerCredential } from './ai-ledger-credential.js';

export const FOOD_DOMAIN = 'food';
export const ANTHROPIC_PROVIDER = 'anthropic';

const DEFAULT_AI_API_URL = 'http://ai-api:3008';

function resolveAiApiUrl(): string {
  return process.env['AI_API_URL'] ?? DEFAULT_AI_API_URL;
}

/**
 * Wraps a {@link LookupPricingFn} with a per-(provider, model) cache. Pricing
 * is effectively static for a process lifetime, so a single HTTP read per pair
 * is enough; a `null` miss is cached too so an unpriced model never re-hits the
 * ai pillar on every inference.
 */
function memoizePricing(lookup: LookupPricingFn): LookupPricingFn {
  const cache = new Map<string, Promise<PricingEntry | null>>();
  return (provider, model) => {
    const key = `${provider} ${model}`;
    let entry = cache.get(key);
    if (entry === undefined) {
      entry = lookup(provider, model);
      cache.set(key, entry);
    }
    return entry;
  };
}

let cached: CallWithLoggingDeps | undefined;
let override: CallWithLoggingDeps | undefined;

/**
 * Process-cached telemetry deps for food worker callers. `report` is built
 * explicitly, with an `onError` that logs a refused or undelivered record
 * (POPS-2332) — the default env-driven sink has no such hook, so leaving
 * `report` unset made a revoked or stale credential fail silently.
 */
export function foodTelemetryDeps(): CallWithLoggingDeps {
  if (override) return override;
  cached ??= {
    lookupPricing: memoizePricing(httpLookupPricing(resolveAiApiUrl())),
    report: createEnvReportSink({
      credential: resolveLedgerCredential(),
      onError: (error) => {
        console.warn(ledgerReportFailedMessage(error));
      },
    }),
  };
  return cached;
}

/** Test seam: inject fake `report`/`lookupPricing`; pass null to restore. */
export function __setFoodTelemetryDepsForTests(deps: CallWithLoggingDeps | null): void {
  override = deps ?? undefined;
}
