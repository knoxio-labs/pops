/**
 * Keep finance handler bodies uniformly sync-or-async.
 *
 * Handlers translate `@pops/finance` db domain errors into `HttpError`.
 * `HttpError` extends the shared `PopsError`; it must escape to the
 * final Express error handler so that handler can attach the request ID.
 */

/**
 * Run a sync or async handler body while preserving thrown failures for the
 * final Express error handler.
 */
export async function runHttp<T extends { status: number; body: unknown }>(
  fn: () => T | Promise<T>
): Promise<T> {
  return fn();
}
