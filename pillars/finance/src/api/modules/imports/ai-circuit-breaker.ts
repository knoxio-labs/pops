/**
 * Per-import-run circuit breaker for the AI categorizer (CP026/#3656/CF039).
 *
 * Before this, every row independently re-walked `withRateLimitRetry`'s full
 * 5-retry backoff ladder on a 429 — under sustained rate pressure a large
 * import could stall for minutes with no way to notice the provider is down
 * and stop asking it. One instance is created per `processImportCore` run and
 * threaded through the batch resolver: once `threshold` batch calls in a row
 * come back `RATE_LIMITED`, `isOpen` flips and the resolver stops calling the
 * AI entirely for the rest of the run, bucketing the remaining pending rows
 * uncertain instead of paying for more retries that are unlikely to succeed.
 */
const DEFAULT_THRESHOLD = 3;

/** Consecutive-429-batches threshold, overridable via `FINANCE_AI_CATEGORIZER_CIRCUIT_BREAKER_THRESHOLD`. */
export function getCircuitBreakerThreshold(): number {
  const raw = process.env['FINANCE_AI_CATEGORIZER_CIRCUIT_BREAKER_THRESHOLD'];
  const parsed = raw !== undefined && raw !== '' ? Number(raw) : Number.NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : DEFAULT_THRESHOLD;
}

export class AiCircuitBreaker {
  private consecutiveRateLimits = 0;

  constructor(private readonly threshold: number = getCircuitBreakerThreshold()) {}

  /** True once `threshold` consecutive rate-limited calls have been recorded. */
  get isOpen(): boolean {
    return this.consecutiveRateLimits >= this.threshold;
  }

  /** Record a batch call that came back rate-limited (429 exhausted its own retries). */
  recordRateLimited(): void {
    this.consecutiveRateLimits++;
  }

  /** Record a batch call that completed without a rate-limit failure — resets the streak. */
  recordRecovery(): void {
    this.consecutiveRateLimits = 0;
  }
}
