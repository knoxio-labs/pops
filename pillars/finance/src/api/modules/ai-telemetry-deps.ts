/**
 * Shared `@pops/ai-telemetry` dependency wiring for finance's Claude callers.
 *
 * Every finance call site routes through `callWithLogging`, reporting
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
  memoizePricing,
} from '@pops/ai-telemetry';

import { ledgerReportFailedMessage, resolveLedgerCredential } from './ai-ledger-credential.js';

export const FINANCE_DOMAIN = 'finance';
export const ANTHROPIC_PROVIDER = 'anthropic';

const DEFAULT_AI_API_URL = 'http://ai-api:3008';

function resolveAiApiUrl(): string {
  return process.env['AI_API_URL'] ?? DEFAULT_AI_API_URL;
}

let cached: CallWithLoggingDeps | undefined;
let override: CallWithLoggingDeps | undefined;

/**
 * Process-cached telemetry deps for finance callers. `report` is built
 * explicitly, with an `onError` that logs a refused or undelivered record
 * (POPS-2332) — the default env-driven sink has no such hook, so leaving
 * `report` unset made a revoked or stale credential fail silently.
 */
export function financeTelemetryDeps(): CallWithLoggingDeps {
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
export function __setFinanceTelemetryDepsForTests(deps: CallWithLoggingDeps | null): void {
  override = deps ?? undefined;
}
