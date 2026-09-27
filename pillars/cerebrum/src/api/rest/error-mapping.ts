/** Run a cerebrum handler while allowing shared `PopsError` middleware to serialize failures. */
export async function runHttp<T>(fn: () => T | Promise<T>): Promise<T> {
  return await fn();
}
