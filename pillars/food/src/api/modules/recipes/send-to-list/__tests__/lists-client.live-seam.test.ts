/**
 * Live seam test — food's real, unstubbed {@link createListsClient} against a
 * real registry + real lists pillar, both booted as actual OS processes
 * (see `@pops/pillar-sdk/testing`'s `spawnPillarProcess`).
 *
 * `lists-client.test.ts` in this same directory only proves the input each
 * operation hands the SDK; it stubs the `PillarHandle` entirely, so it can
 * never catch a registry-discovery failure or a path/body the real lists
 * contract rejects. This file boots the two real processes over loopback
 * HTTP, drives `createListsClient()` with no stub, and independently reads
 * the result back from lists' own `GET /lists/:id` — not the SDK's view of
 * it — so a bug that made both sides agree on a wrong shape would still
 * surface.
 *
 * Excluded from the default `pnpm test` run (see `vitest.config.ts`'s
 * `live-seam` exclusion) — it spawns two real processes and is an order of
 * magnitude slower than this pillar's unit suite. Run it directly with
 * `pnpm test:live-seam`.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { __resetSharedPillarClient, __resetSharedOpenApiCache } from '@pops/pillar-sdk/client';
import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  waitForRegistration,
  type SpawnedPillarProcess,
} from '@pops/pillar-sdk/testing';

import { createListsClient, LISTS_PILLAR_ID } from '../lists-client.js';

interface RecordedRequest {
  method: string;
  url: string;
}

/** `false` for a relative or otherwise unparseable URL rather than throwing. */
function matchesPort(url: string, port: string): boolean {
  try {
    return new URL(url).port === port;
  } catch {
    return false;
  }
}

describe('food -> lists live seam', () => {
  let registryProcess: SpawnedPillarProcess;
  let listsProcess: SpawnedPillarProcess;
  let tempDir: string;
  let originalRegistryUrl: string | undefined;
  let originalFetch: typeof fetch;
  let wireLog: RecordedRequest[];

  beforeAll(async () => {
    tempDir = mkdtempSync(join(tmpdir(), 'live-seam-food-lists-'));

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

    const listsPort = await getFreePort();
    listsProcess = await spawnPillarProcess({
      label: 'lists',
      cwd: resolvePillarDir(import.meta.url, 'lists'),
      port: listsPort,
      env: {
        POPS_REGISTRY_ENABLED: 'true',
        POPS_REGISTRY_URL: registryProcess.baseUrl,
        LISTS_SQLITE_PATH: join(tempDir, 'lists.db'),
        // Every real deployment sets this explicitly (see
        // infra/docker-compose.yml) rather than relying on the
        // `http://localhost:<port>` fallback `resolveSelfBaseUrl` uses when
        // it's unset — set it here too so the base URL the registry hands
        // back to food matches the loopback address this test actually
        // dials.
        LISTS_SELF_BASE_URL: `http://127.0.0.1:${listsPort}`,
      },
    });

    await waitForRegistration(registryProcess.baseUrl, LISTS_PILLAR_ID);

    originalRegistryUrl = process.env['POPS_REGISTRY_URL'];
    process.env['POPS_REGISTRY_URL'] = registryProcess.baseUrl;
    __resetSharedPillarClient();
    __resetSharedOpenApiCache();

    wireLog = [];
    originalFetch = globalThis.fetch;
    const listsPortString = String(listsProcess.port);
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      // Match by PORT, not by the exact base-URL string: `resolveSelfBaseUrl`
      // defaults an unset `LISTS_SELF_BASE_URL` to `http://localhost:<port>`,
      // which is what lists actually registers and what the SDK actually
      // dials — not the `127.0.0.1` form this file uses for its own direct
      // verification requests. Recording by port catches the real request
      // regardless of which loopback spelling produced it.
      //
      // This wrapper replaces the PROCESS-WIDE fetch, so it sees every
      // fetch call made anywhere during the test, not just ones aimed at
      // lists — `new URL()` throws on a relative input, which a well-behaved
      // absolute-URL caller never sends but this recorder cannot assume.
      if (matchesPort(url, listsPortString)) {
        wireLog.push({
          method: init?.method ?? (input instanceof Request ? input.method : 'GET'),
          url,
        });
      }
      return originalFetch(input, init);
    }) as typeof fetch;
  }, 30_000);

  afterAll(async () => {
    globalThis.fetch = originalFetch;
    if (originalRegistryUrl === undefined) delete process.env['POPS_REGISTRY_URL'];
    else process.env['POPS_REGISTRY_URL'] = originalRegistryUrl;
    __resetSharedPillarClient();
    __resetSharedOpenApiCache();
    await listsProcess?.stop();
    await registryProcess?.stop();
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('sends a real send-to-list request that lists actually receives and persists', async () => {
    const client = createListsClient();

    const listId = await client.createShoppingList('Live seam test list');
    expect(listId).toBeGreaterThan(0);

    const result = await client.upsertByRef(listId, {
      refKind: 'custom',
      refId: 1,
      label: 'Live seam test item',
      qty: 2,
      unit: 'pcs',
    });
    expect(result.outcome).toBe('inserted');
    expect(result.itemId).toBeGreaterThan(0);

    // Independent verification: read lists' OWN wire response directly,
    // bypassing the SDK entirely, so a bug that made both sides agree on a
    // wrong shape would still be caught.
    const raw = await fetch(`${listsProcess.baseUrl}/lists/${listId}`);
    expect(raw.status).toBe(200);
    const body = (await raw.json()) as {
      list: { id: number; kind: string };
      items: { id: number; label: string; qty: number | null; unit: string | null }[];
    };
    expect(body.list.kind).toBe('shopping');
    const persisted = body.items.find((item) => item.id === result.itemId);
    expect(persisted).toBeDefined();
    expect(persisted?.label).toBe('Live seam test item');
    expect(persisted?.qty).toBe(2);
    expect(persisted?.unit).toBe('pcs');

    expect(wireLog).toEqual(
      expect.arrayContaining([
        { method: 'POST', url: `${listsProcess.baseUrl}/lists` },
        { method: 'POST', url: `${listsProcess.baseUrl}/lists/${listId}/items/upsert-by-ref` },
      ])
    );

    console.log(
      '[live seam wire log] food -> lists',
      JSON.stringify(
        {
          registryBaseUrl: registryProcess.baseUrl,
          listsBaseUrl: listsProcess.baseUrl,
          requests: wireLog,
        },
        null,
        2
      )
    );
  });
});
