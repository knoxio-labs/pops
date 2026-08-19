/**
 * `@pops/ai-telemetry` wiring for the receipt drop-zone.
 *
 * Built once per process: an `httpLookupPricing` adapter pointed at the ai
 * pillar, wrapped in a per-(provider, model) memo so a hundred-receipt
 * backfill does not re-read `GET /ai-pricing` a hundred times. Reporting is
 * fire-and-forget — a slow or absent sink never changes what a caller does.
 *
 * `report` is the env-driven sink built explicitly rather than left to the
 * wrapper's default, for two reasons: a record the ai pillar refuses is
 * logged instead of dropped, because the cost of losing one is a ledger that
 * is quietly short and a fleet AI spend figure nobody knows to distrust; and
 * the credential is resolved file-then-environment here, which the default's
 * env-only read is not.
 *
 * The sink is deliberately NOT given the pricing lookup's `ai-api` fallback
 * URL: an absent `AI_API_URL` is what makes it a no-op under vitest, and a
 * default would have every test in this pillar POST at a hostname that does
 * not resolve. The deployed stack sets `AI_API_URL` instead, which is also
 * what the pricing lookup reads.
 */
import {
  type CallWithLoggingDeps,
  createEnvReportSink,
  httpLookupPricing,
  type LookupPricingFn,
  type PricingEntry,
} from '@pops/ai-telemetry';

import {
  AI_BASE_URL_ENV,
  ledgerReportFailedMessage,
  resolveLedgerCredential,
} from './ai-ledger-credential.js';

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
let override: CallWithLoggingDeps | undefined;

export function purchasesTelemetryDeps(): CallWithLoggingDeps {
  if (override) return override;
  cached ??= {
    lookupPricing: memoizePricing(
      httpLookupPricing(process.env[AI_BASE_URL_ENV] ?? DEFAULT_AI_API_URL)
    ),
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
export function __setPurchasesTelemetryDepsForTests(deps: CallWithLoggingDeps | null): void {
  override = deps ?? undefined;
}
