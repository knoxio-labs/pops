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
 * No Redis is started for this test. `CrossSourceIndexer.scanPeer` always
 * fetches the peer's page before `enqueueChanged` even looks at the queue
 * accessor (`pillars/cerebrum/src/api/modules/thalamus/cross-source.ts`), so
 * the peer round-trip this test cares about — the real wire request reaching
 * finance and finance's real response coming back — happens regardless of
 * queue availability; only the BullMQ enqueue count is unexercised here
 * (`enqueued` is asserted as `0`, the documented no-Redis path). See the PR
 * description for the follow-up ticket covering the Redis-backed enqueue
 * path.
 *
 * Excluded from the default `pnpm test` run (see `vitest.config.ts`'s
 * `live-seam` exclusion) — it spawns three real processes and is an order
 * of magnitude slower than this pillar's unit suite. Run it directly with
 * `pnpm test:live-seam`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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

import { FINANCE_PILLAR_ID } from '../peer-clients.js';

async function createFinanceTransaction(
  financeBaseUrl: string,
  description: string
): Promise<string> {
  const response = await fetch(`${financeBaseUrl}/transactions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      description,
      account: 'Live seam test account',
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
  let tempDir: string;
  let seededTransactionIds: string[];

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'live-seam-cerebrum-finance-'));

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
    seededTransactionIds = [
      await createFinanceTransaction(financeProcess.baseUrl, 'Live seam test transaction 1'),
      await createFinanceTransaction(financeProcess.baseUrl, 'Live seam test transaction 2'),
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
      },
      // sqlite-vec + Anthropic-client construction lazily probe rather than
      // block boot, but cerebrum opens a real engram index on startup —
      // give it a little longer than the default.
      startupTimeoutMs: 30_000,
    });
  }, 45_000);

  afterAll(async () => {
    await cerebrumProcess?.stop();
    await financeProcess?.stop();
    await financeProxy?.stop();
    await registryProcess?.stop();
    // `tempDir` may be unset if `beforeAll` threw before `mkdtempSync` ran;
    // `afterAll` still runs cleanup in that case, and rmSync(undefined, ...)
    // would throw and mask the original failure.
    if (tempDir) rmSync(tempDir, { recursive: true, force: true });
  });

  it('reindex-sources reaches the real finance pillar and reads back the seeded rows', async () => {
    expect(seededTransactionIds).toHaveLength(2);

    const response = await fetch(`${cerebrumProcess.baseUrl}/index/reindex-sources`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceTypes: ['transaction'] }),
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { enqueued: number; sourceTypes: string[] };
    expect(body.sourceTypes).toEqual(['transaction']);
    // No Redis in this test: the queue accessor returns null, so nothing is
    // actually enqueued. The peer round-trip below is what this test is
    // proving; see the file header for why that's the right scope here.
    expect(body.enqueued).toBe(0);

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
  });
});
