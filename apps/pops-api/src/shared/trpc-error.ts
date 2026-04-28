/**
 * Helper to create a TRPCError with an i18n `messageKey` attached.
 *
 * The `messageKey` travels through TRPCError.cause and is surfaced by the
 * custom `errorFormatter` in `trpc.ts` so the frontend can look it up in
 * its translation files.
 */
import { TRPCError } from '@trpc/server';

import { errorMessage } from './error-messages.js';

import type { ErrorMessageKey, ErrorMessageParams } from './error-messages.js';

/** Lightweight carrier so the errorFormatter can read `messageKey`. */
class MessageKeyCause extends Error {
  constructor(
    public readonly messageKey: ErrorMessageKey,
    originalCause?: unknown
  ) {
    super(messageKey);
    this.name = 'MessageKeyCause';
    if (originalCause !== undefined) {
      this.cause = originalCause;
    }
  }
}

/**
 * Build a `TRPCError` whose `message` is the resolved EN-AU string and whose
 * `cause` carries the `messageKey` for the frontend i18n layer.
 */
export function trpcError(
  code: ConstructorParameters<typeof TRPCError>[0]['code'],
  key: ErrorMessageKey,
  params?: ErrorMessageParams,
  cause?: unknown
): TRPCError {
  return new TRPCError({
    code,
    message: errorMessage(key, params),
    cause: new MessageKeyCause(key, cause),
  });
}
