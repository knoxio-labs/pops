/**
 * A throwaway `redis:7-alpine` container for the live-seam suites.
 *
 * Same shape as the cerebrum pillar's live-seam helper
 * (`pillars/cerebrum/src/api/modules/retrieval/__tests__/peer-clients.live-seam.test.ts`),
 * kept local so this package needs no dependency on a pillar's test kit.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:net';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import { Redis } from 'ioredis';

const execFileAsync = promisify(execFile);

const REDIS_IMAGE = 'redis:7-alpine';
// Generous: on a cold Docker cache `docker run` blocks on the image pull
// before the container even starts.
const RUN_TIMEOUT_MS = 120_000;
const STOP_TIMEOUT_MS = 10_000;
const READY_TIMEOUT_MS = 20_000;
const READY_POLL_INTERVAL_MS = 200;

export interface EphemeralRedis {
  readonly url: string;
  stop(): Promise<void>;
}

/** An ephemeral port the OS just told us is free. */
async function getFreePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close(() => {
          reject(new Error('Could not resolve an ephemeral port'));
        });
        return;
      }
      const { port } = address;
      server.close(() => {
        resolve(port);
      });
    });
  });
}

/**
 * `docker stop`/`rm` on a container that is already gone fails with this
 * daemon-reported message — the only case cleanup treats as success.
 */
function isMissingContainerError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'stderr' in err &&
    typeof (err as { stderr: unknown }).stderr === 'string' &&
    (err as { stderr: string }).stderr.includes('No such container')
  );
}

/** Polls with a fresh `lazyConnect` client per attempt — ioredis does not
 * reliably reconnect an instance whose first connect failed. */
async function waitForReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;
  while (Date.now() < deadline) {
    const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: null });
    try {
      await client.connect();
      await client.ping();
      await client.quit();
      return;
    } catch (err) {
      lastError = err;
      client.disconnect();
      await sleep(READY_POLL_INTERVAL_MS);
    }
  }
  throw new Error(`Ephemeral Redis at ${url} never became ready`, { cause: lastError });
}

/** Starts a Redis container on a free port and waits for it to accept commands. */
export async function startEphemeralRedis(label: string): Promise<EphemeralRedis> {
  const port = await getFreePort();
  const containerName = `pops-jobs-${label}-${randomUUID()}`;

  try {
    await execFileAsync(
      'docker',
      ['run', '--rm', '-d', '--name', containerName, '-p', `${port}:6379`, REDIS_IMAGE],
      { timeout: RUN_TIMEOUT_MS }
    );
  } catch (err) {
    throw new Error(
      `Failed to start ephemeral Redis via Docker (image ${REDIS_IMAGE}). This suite requires a ` +
        `working Docker daemon.`,
      { cause: err }
    );
  }

  const url = `redis://127.0.0.1:${port}`;
  try {
    await waitForReady(url, READY_TIMEOUT_MS);
  } catch (err) {
    await execFileAsync('docker', ['rm', '-f', containerName], {
      timeout: STOP_TIMEOUT_MS,
    }).catch(() => {});
    throw err;
  }

  return {
    url,
    async stop() {
      try {
        await execFileAsync('docker', ['stop', '-t', '2', containerName], {
          timeout: STOP_TIMEOUT_MS,
        });
      } catch (err) {
        if (!isMissingContainerError(err)) throw err;
      }
    },
  };
}
