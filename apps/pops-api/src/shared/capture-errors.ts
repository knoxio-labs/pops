// Test-only helpers: invoke `fn` and return whatever it threw / rejected with.
// If `fn` returns normally these throw a clear error so a missing throw can
// never silently let a `catch`-block assertion pass.

export function captureThrow(fn: () => unknown): unknown {
  try {
    fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to throw, but it returned normally');
}

export async function captureReject(fn: () => Promise<unknown>): Promise<unknown> {
  try {
    await fn();
  } catch (err) {
    return err;
  }
  throw new Error('expected the call to reject, but it resolved');
}
