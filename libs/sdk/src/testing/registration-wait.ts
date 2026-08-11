import { setTimeout as sleep } from 'node:timers/promises';

const DEFAULT_TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 200;
const FETCH_TIMEOUT_MS = 2_000;

interface RegistrySnapshotEntry {
  pillarId?: unknown;
  registered?: unknown;
  status?: unknown;
}

interface RegistrySnapshotBody {
  pillars?: unknown;
}

function isRegisteredAndHealthy(entry: RegistrySnapshotEntry, pillarId: string): boolean {
  if (entry.pillarId !== pillarId) return false;
  if (entry.registered === false) return false;
  return entry.status !== 'unavailable';
}

/**
 * Poll a registry's discovery snapshot until it lists `pillarId` as
 * registered and not `unavailable` — i.e. until the peer's background
 * `bootstrapPillar` registration has actually landed, not merely that its
 * process answers `/health`. The two are different moments: registration
 * runs in the background after `app.listen` (see every pillar's
 * `server.ts`), so a health check passing says nothing about whether the
 * registry has heard from it yet.
 */
export async function waitForRegistration(
  registryBaseUrl: string,
  pillarId: string,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const registered = await checkRegistered(registryBaseUrl, pillarId);
    if (registered) return;
    if (Date.now() > deadline) {
      throw new Error(
        `timed out after ${timeoutMs}ms waiting for '${pillarId}' to register with ${registryBaseUrl}`
      );
    }
    await sleep(POLL_INTERVAL_MS);
  }
}

async function checkRegistered(registryBaseUrl: string, pillarId: string): Promise<boolean> {
  try {
    const response = await fetch(`${registryBaseUrl}/registry/pillars`, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return false;
    const body = (await response.json()) as RegistrySnapshotBody;
    if (!Array.isArray(body.pillars)) return false;
    return body.pillars.some(
      (entry): boolean =>
        typeof entry === 'object' &&
        entry !== null &&
        isRegisteredAndHealthy(entry as RegistrySnapshotEntry, pillarId)
    );
  } catch {
    return false;
  }
}
