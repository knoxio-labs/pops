/**
 * The bounded wait a scheduler's shutdown path runs before the server closes.
 *
 * A SIGTERM that closes the server under an in-flight tick cuts a Plex fetch
 * or a Radarr mutation off mid-write. Each scheduler publishes the promise of
 * the work it has in flight, and the shutdown step races it against a bound
 * here, so both schedulers drain the same way (POPS-78, POPS-2583).
 */

/**
 * Resolve once `inflight` settles, or after `timeoutMs`.
 *
 * @returns `true` when the work settled (or nothing was in flight), `false`
 *   when the bound elapsed first. A rejection counts as settled: the work is
 *   no longer running, which is all a shutdown needs to know.
 */
export async function waitForSettled(
  inflight: Promise<unknown> | null,
  timeoutMs: number
): Promise<boolean> {
  if (inflight === null) return true;
  let timer: NodeJS.Timeout | undefined;
  const expiry = new Promise<boolean>((resolve) => {
    timer = setTimeout(() => resolve(false), timeoutMs);
    timer.unref();
  });
  try {
    return await Promise.race([
      inflight.then(
        () => true,
        () => true
      ),
      expiry,
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
