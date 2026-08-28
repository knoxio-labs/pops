/**
 * AI categorization error — thrown when the Anthropic API call fails, no key
 * is configured, or the model's response cannot be parsed into a JSON object
 * (`PARSE_ERROR`). Its own module so tests can import it without pulling in the
 * SDK. The caller (`tryAiCategorization`) degrades any of these to an uncertain
 * row rather than failing the transaction.
 *
 * `RATE_LIMITED` marks a 429 that survived `withRateLimitRetry`'s full backoff
 * ladder — a distinct code from the generic `API_ERROR` so the batch resolver
 * (CP026) can tell "the provider is rate-limiting us" apart from any other
 * failure and trip the shared circuit breaker instead of just degrading one row.
 *
 * `EMPTY_VOCABULARY` marks a prompt that could not be built at all because the
 * closed tag vocabulary is empty (POPS-2606) — a broken database rather than a
 * provider failure, and worth its own code so it is not read as one. The row
 * still degrades to uncertain; the import does not fail.
 */
import { EmptyClosedVocabularyError } from './ai-categorizer-prompt.js';

export class AiCategorizationError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'NO_API_KEY'
      | 'API_ERROR'
      | 'INSUFFICIENT_CREDITS'
      | 'PARSE_ERROR'
      | 'RATE_LIMITED'
      | 'EMPTY_VOCABULARY'
  ) {
    super(message);
    this.name = 'AiCategorizationError';
  }
}

interface ParsedApiError {
  status: number;
  message?: string;
  error?: { error?: { message?: string } };
}

function isParsedApiError(error: unknown): error is ParsedApiError {
  return typeof error === 'object' && error !== null && 'status' in error;
}

/** Maps a status-carrying API error to a specific `AiCategorizationError`, or `null` for the generic fallback. */
function mapKnownApiError(apiError: ParsedApiError): AiCategorizationError | null {
  if (apiError.status === 429) {
    return new AiCategorizationError(
      `Anthropic API rate limit exhausted: ${apiError.message ?? 'Too Many Requests'}`,
      'RATE_LIMITED'
    );
  }
  const creditMessage = apiError.error?.error?.message ?? apiError.message ?? '';
  if (apiError.status === 400 && creditMessage.toLowerCase().includes('credit balance')) {
    return new AiCategorizationError(
      'Anthropic API credit balance too low. Please add credits at https://console.anthropic.com/settings/plans',
      'INSUFFICIENT_CREDITS'
    );
  }
  return null;
}

/** Maps any Anthropic call failure to an `AiCategorizationError`, and throws it. */
export function throwApiError(error: unknown): never {
  if (error instanceof EmptyClosedVocabularyError) {
    throw new AiCategorizationError(error.message, 'EMPTY_VOCABULARY');
  }
  if (isParsedApiError(error)) {
    const known = mapKnownApiError(error);
    if (known) throw known;
    throw new AiCategorizationError(
      `Anthropic API error: ${error.message ?? 'Unknown error'}`,
      'API_ERROR'
    );
  }
  throw new AiCategorizationError(
    `Failed to categorize: ${error instanceof Error ? error.message : 'Unknown error'}`,
    'API_ERROR'
  );
}
