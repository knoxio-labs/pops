/**
 * Retry an async Anthropic call with exponential backoff + jitter on HTTP
 * 429 (rate limit) or 5xx (transient server error). Ported from the
 * monolith's `lib/ai-retry`, with the retry bounds hardcoded (the pillar
 * drops the core-settings lookup) and pino swapped for `console.warn`.
 *
 * 5xx/network failures get a smaller retry budget than 429 — a rate limit
 * is expected to clear on its own timeline, but a repeated 5xx more likely
 * signals an outage worth failing fast on (CF078/#3670).
 */
const MAX_RETRIES = 5;
const SERVER_ERROR_MAX_RETRIES = 2;
const BASE_DELAY_MS = 1000;

type RetryableKind = 'rate-limit' | 'server-error';

function classifyRetryable(error: unknown): RetryableKind | null {
  if (!(error instanceof Error) || !('status' in error)) return null;
  const status = (error as { status: unknown }).status;
  if (typeof status !== 'number') return null;
  if (status === 429) return 'rate-limit';
  if (status >= 500 && status < 600) return 'server-error';
  return null;
}

export async function withRateLimitRetry<T>(fn: () => Promise<T>, context: string): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const kind = classifyRetryable(error);
      const maxRetries = kind === 'rate-limit' ? MAX_RETRIES : SERVER_ERROR_MAX_RETRIES;
      if (!kind || attempt === maxRetries) throw error;

      const delay = BASE_DELAY_MS * 2 ** attempt + Math.random() * 500;
      const label = kind === 'rate-limit' ? 'Rate limited (429)' : 'Server error (5xx)';
      console.warn(
        `[AI] ${label} on "${context}" — retry ${attempt + 1}/${maxRetries} in ${Math.round(delay)}ms`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}
