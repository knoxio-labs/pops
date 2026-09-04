/**
 * Live seam test — cerebrum's real, unstubbed peer clients ({@link
 * createPeerClients}) against a real registry + real finance pillar, both
 * booted as actual OS processes (see `@pops/pillar-sdk/testing`'s
 * `spawnPillarProcess`).
 *
 * `peer-clients.test.ts` in this same directory only proves the input each
 * operation hands the SDK; it stubs the `PillarHandle` entirely, so it can
 * never catch a registry-discovery failure or a query the real finance
 * contract rejects. This file drives the seam through cerebrum's OWN real
 * HTTP server (`POST /index/reindex-sources`) rather than calling
 * `peer-clients.ts` directly — `server.ts` already wires `peerClients:
 * createPeerClients()` unstubbed by default, so booting the real consumer
 * process and hitting its real endpoint exercises the exact production
 * wiring with no extra plumbing.
 *
 * Cerebrum's outbound call to finance happens inside the CEREBRUM child
 * process, not this test process, so there is no `fetch` here to intercept —
 * unlike the food/lists live-seam test, which calls `createListsClient()`
 * in-process. Instead, finance registers itself with the registry under a
 * `startRecordingProxy` address: the registry hands cerebrum that address,
 * every request is forwarded to the real finance unchanged, and the proxy
 * records what actually crossed the wire.
 *
 * An ephemeral Redis (`redis:7-alpine`, started via Docker) backs this test
 * too, for the duration of the test only, its URL passed to the CEREBRUM
 * child process as `REDIS_URL`. That makes `CrossSourceIndexer.scanPeer`'s
 * `enqueueChanged` step (`pillars/cerebrum/src/api/modules/thalamus/cross-source.ts`)
 * enqueue through cerebrum's real, unstubbed `getEmbeddingsQueue()` producer
 * instead of degrading to the no-Redis `null` path, so the peer round-trip
 * AND the real BullMQ enqueue both get exercised through the real HTTP
 * endpoint. The test opens its own `Queue` against that same Redis afterward
 * to assert what cerebrum actually produced — job count and payload — since
 * cerebrum's own process is the one that called `queue.add()`.
 * `CrossSourceIndexer.enqueueChanged`'s selection/hashing logic already has
 * unit coverage against a fake queue accessor
 * (`pillars/cerebrum/src/api/__tests__/index.test.ts`); this test is the one
 * place that proves the real wiring — a real `ioredis` connection, a real
 * BullMQ `Queue.add()`, a real `Queue.getJobs()` — works end to end.
 *
 * Excluded from the default `pnpm test` run (see `vitest.config.ts`'s
 * `live-seam` exclusion) — it spawns three real processes plus a Redis
 * container and is an order of magnitude slower than this pillar's unit
 * suite. Run it directly with `pnpm test:live-seam`; it requires Docker.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { promisify } from 'node:util';

import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  startRecordingProxy,
  waitForRegistration,
  type RecordingProxy,
  type SpawnedPillarProcess,
} from '@pops/pillar-sdk/testing';

import { EMBEDDINGS_QUEUE_NAME, type EmbeddingJobData } from '../../thalamus/queue.js';
import { FINANCE_PILLAR_ID } from '../peer-clients.js';

const execFileAsync = promisify(execFile);

const REDIS_IMAGE = 'redis:7-alpine';
// Generous: on a cold Docker cache `docker run` blocks on the image pull
// before the container even starts, and a first pull of a small Alpine-based
// image can still take the better part of a minute on a slow or rate-limited
// connection.
const REDIS_RUN_TIMEOUT_MS = 120_000;
const REDIS_STOP_TIMEOUT_MS = 10_000;
const REDIS_READY_TIMEOUT_MS = 20_000;
const REDIS_READY_POLL_INTERVAL_MS = 200;

interface EphemeralRedis {
  url: string;
  stop(): Promise<void>;
}

/**
 * `docker stop`/`rm` on a container that is already gone (daemon restart,
 * out-of-band cleanup) fails with this daemon-reported message — the only
 * case cleanup should treat as success rather than a real failure.
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

/**
 * Starts a throwaway `redis:7-alpine` container bound to a free host port
 * and waits for it to accept connections. `--rm` means `docker stop` also
 * removes the container, so `stop()` alone is sufficient cleanup.
 */
async function startEphemeralRedis(): Promise<EphemeralRedis> {
  const port = await getFreePort();
  const containerName = `pops-cerebrum-live-seam-redis-${randomUUID()}`;

  try {
    await execFileAsync(
      'docker',
      ['run', '--rm', '-d', '--name', containerName, '-p', `${port}:6379`, REDIS_IMAGE],
      { timeout: REDIS_RUN_TIMEOUT_MS }
    );
  } catch (err) {
    throw new Error(
      `Failed to start ephemeral Redis via Docker (image ${REDIS_IMAGE}). This test requires a ` +
        `working Docker daemon.`,
      { cause: err }
    );
  }

  const url = `redis://127.0.0.1:${port}`;
  try {
    await waitForRedisReady(url, REDIS_READY_TIMEOUT_MS);
  } catch (err) {
    // Best-effort: `waitForRedisReady` already failed, so this is cleanup on
    // an already-erroring path — `err` below is what the caller sees either
    // way, and there is no test to keep alive by being strict here.
    await execFileAsync('docker', ['rm', '-f', containerName], {
      timeout: REDIS_STOP_TIMEOUT_MS,
    }).catch(() => {});
    throw err;
  }

  return {
    url,
    async stop() {
      try {
        await execFileAsync('docker', ['stop', '-t', '2', containerName], {
          timeout: REDIS_STOP_TIMEOUT_MS,
        });
      } catch (err) {
        // Anything other than "it's already gone" is a real cleanup failure
        // (e.g. a leaked, still-running container) and should surface.
        if (!isMissingContainerError(err)) throw err;
      }
    },
  };
}

/**
 * Polls with a fresh `lazyConnect` client per attempt — once a connect
 * attempt fails, reusing the same `ioredis` instance for a retry is not
 * reliable, so each attempt gets its own short-lived client instead.
 */
async function waitForRedisReady(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    const client = new Redis(url, { lazyConnect: true, maxRetriesPerRequest: 1 });
    try {
      await client.connect();
      await client.ping();
      return;
    } catch (err) {
      lastError = err;
      await sleep(REDIS_READY_POLL_INTERVAL_MS);
    } finally {
      client.disconnect();
    }
  }
  throw new Error(
    `Redis at ${url} did not become ready within ${timeoutMs}ms: ${String(lastError)}`
  );
}

async function createFinanceAccount(financeBaseUrl: string): Promise<string> {
  const response = await fetch(`${financeBaseUrl}/accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      name: 'Amex',
      institutionId: null,
      kind: 'credit-card',
      currency: 'AUD',
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

async function createFinanceTransaction(
  financeBaseUrl: string,
  description: string,
  accountId: string
): Promise<string> {
  const response = await fetch(`${financeBaseUrl}/transactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      description,
      accountId,
      amount: -12.5,
      date: '2026-08-01',
      type: 'purchase',
    }),
  });
  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: { id: string } };
  return body.data.id;
}

describe('cerebrum -> finance live seam', () => {
  let registryProcess: SpawnedPillarProcess;
  let financeProcess: SpawnedPillarProcess;
  let financeProxy: RecordingProxy;
  let cerebrumProcess: SpawnedPillarProcess;
  let redis: EphemeralRedis;
  let tempDir: string;
  let seededTransactionIds: string[];

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'live-seam-cerebrum-finance-'));

    // Started before any pillar process — cerebrum needs `redis.url` at
    // spawn time (below), so this can't run concurrently with the rest of
    // this hook without a floating promise to await later.
    redis = await startEphemeralRedis();

    const registryPort = await getFreePort();
    registryProcess = await spawnPillarProcess({
      label: 'registry',
      cwd: resolvePillarDir(import.meta.url, 'registry'),
      port: registryPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        REGISTRY_SQLITE_PATH: join(tempDir, 'registry.db'),
      },
    });

    const financePort = await getFreePort();
    financeProxy = await startRecordingProxy(`http://127.0.0.1:${financePort}`);
    financeProcess = await spawnPillarProcess({
      label: 'finance',
      cwd: resolvePillarDir(import.meta.url, 'finance'),
      port: financePort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        POPS_REGISTRY_URL: registryProcess.baseUrl,
        FINANCE_SQLITE_PATH: join(tempDir, 'finance.db'),
        // Advertise the RECORDING PROXY's address to the registry, not
        // finance's own — so cerebrum's real SDK call is routed through it
        // and observed, while finance still does the real work on the
        // other side. See file header.
        FINANCE_SELF_BASE_URL: financeProxy.baseUrl,
      },
    });

    await waitForRegistration(registryProcess.baseUrl, FINANCE_PILLAR_ID);

    // Seed a tiny, deliberately non-production-shaped dataset (the ticket's
    // warning is about a real deployment's transaction volume, not a test's
    // two rows) via finance's OWN real create endpoint, dialled directly
    // (not through the proxy) — seeding is setup, not the seam under test.
    const seedAccountId = await createFinanceAccount(financeProcess.baseUrl);
    seededTransactionIds = [
      await createFinanceTransaction(
        financeProcess.baseUrl,
        'Live seam test transaction 1',
        seedAccountId
      ),
      await createFinanceTransaction(
        financeProcess.baseUrl,
        'Live seam test transaction 2',
        seedAccountId
      ),
    ];

    const cerebrumPort = await getFreePort();
    cerebrumProcess = await spawnPillarProcess({
      label: 'cerebrum',
      cwd: resolvePillarDir(import.meta.url, 'cerebrum'),
      port: cerebrumPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        POPS_REGISTRY_URL: registryProcess.baseUrl,
        CEREBRUM_SQLITE_PATH: join(tempDir, 'cerebrum.db'),
        CEREBRUM_ENGRAMS_DIR: join(tempDir, 'engrams'),
        CEREBRUM_SELF_BASE_URL: `http://127.0.0.1:${cerebrumPort}`,
        // Real Redis for this test only (see file header) — without this,
        // `getEmbeddingsQueue()` degrades to the no-Redis `null` producer.
        REDIS_URL: redis.url,
      },
      // sqlite-vec + Anthropic-client construction lazily probe rather than
      // block boot, but cerebrum opens a real engram index on startup —
      // give it a little longer than the default.
      startupTimeoutMs: 30_000,
    });
    // Wide enough to absorb a cold `docker pull` of the Redis image
    // (REDIS_RUN_TIMEOUT_MS) on top of the three pillar spawns above.
  }, 150_000);

  afterAll(async () => {
    await cerebrumProcess?.stop();
    await financeProcess?.stop();
    await financeProxy?.stop();
    await registryProcess?.stop();
    await redis?.stop();
    // `tempDir` may be unset if `beforeAll` threw before `mkdtempSync` ran;
    // `afterAll` still runs cleanup in that case, and rmSync(undefined, ...)
    // would throw and mask the original failure.
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('reindex-sources reaches the real finance pillar, reads back the seeded rows, and enqueues real BullMQ jobs', async () => {
    expect(seededTransactionIds).toHaveLength(2);

    const response = await fetch(`${cerebrumProcess.baseUrl}/index/reindex-sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceTypes: ['transaction'] }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { enqueued: number; sourceTypes: string[] };
    expect(body.sourceTypes).toEqual(['transaction']);
    // Real Redis this time (see file header): neither seeded row has been
    // embedded before, so both get enqueued.
    expect(body.enqueued).toBe(seededTransactionIds.length);

    const financeCalls = financeProxy.requests.filter((entry) =>
      entry.url.includes('/transactions')
    );
    expect(financeCalls.length).toBeGreaterThan(0);
    for (const call of financeCalls) {
      expect(call.method).toBe('GET');
      expect(call.status).toBe(200);
    }
    expect(financeCalls[0]?.url).toMatch(/\/transactions\?.*limit=100/);

    // Not just "finance answered 200" — finance answered with OUR rows.
    const combinedBodies = financeCalls.map((call) => call.bodySnippet).join('\n');
    expect(combinedBodies).toContain('Live seam test transaction 1');
    expect(combinedBodies).toContain('Live seam test transaction 2');

    // The response's `enqueued` count is cerebrum's own bookkeeping — cross
    // the wire independently, as a second BullMQ producer/consumer would, to
    // prove cerebrum's `queue.add()` calls actually landed in Redis rather
    // than merely being counted.
    const verificationConnection = new Redis(redis.url, { maxRetriesPerRequest: null });
    const verificationQueue = new Queue<EmbeddingJobData>(EMBEDDINGS_QUEUE_NAME, {
      connection: verificationConnection,
    });
    try {
      const counts = await verificationQueue.getJobCounts('waiting');
      expect(counts['waiting']).toBe(seededTransactionIds.length);

      const jobs = await verificationQueue.getJobs(['waiting']);
      expect(jobs).toHaveLength(seededTransactionIds.length);

      const payloads = jobs.map((job) => job.data);
      for (const payload of payloads) {
        expect(payload.sourceType).toBe('transaction');
        expect(seededTransactionIds).toContain(payload.sourceId);
      }
      const sourceIds = payloads.map((payload) => payload.sourceId).toSorted();
      expect(sourceIds).toEqual([...seededTransactionIds].toSorted());

      const combinedContent = payloads.map((payload) => payload.content).join('\n');
      expect(combinedContent).toContain('Live seam test transaction 1');
      expect(combinedContent).toContain('Live seam test transaction 2');
    } finally {
      await verificationQueue.close();
      verificationConnection.disconnect();
    }
  });
});
