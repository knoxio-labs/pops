/**
 * Shared error normalisation helper.
 *
 * Cerebrum pages all consume tRPC mutation/query errors that may be a
 * `TRPCClientError`, an `Error`, or arbitrary `unknown` payloads. The
 * UI only needs a short human-readable message; extract it consistently
 * so every panel renders the same fallback when the shape is unexpected.
 */
export function extractMessage(err: unknown): string {
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message?: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return 'Unknown error';
}
