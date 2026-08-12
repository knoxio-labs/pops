/**
 * Lightweight helpers for the generated Hey API purchases SDK.
 *
 * Lives outside `src/purchases-api/` because the codegen wipes that directory
 * on every regeneration. Anything hand-authored here is safe.
 */

function serverMessage(error: unknown): string | null {
  if (typeof error !== 'object' || error === null || !('message' in error)) return null;
  const { message } = error;
  return typeof message === 'string' && message.length > 0 ? message : null;
}

/**
 * Unwrap a Hey API `{ data, error }` result into its data payload, or throw if
 * the response was an error. Surfaces the server's own `message` when it sent
 * one, so error UI gets the 404 explaining that the link is already gone
 * rather than a generic failure string.
 */
export function unwrap<T>(result: { data?: T; error?: unknown }): T {
  if (result.error !== undefined) {
    throw new Error(serverMessage(result.error) ?? 'purchases API request failed');
  }
  if (result.data === undefined) {
    throw new Error('purchases API returned no data');
  }
  return result.data;
}
