/**
 * Run a handler body while leaving failures to the shared Express pipeline.
 */
export async function runHttp<T>(fn: () => T | Promise<T>): Promise<T> {
  return await fn();
}
