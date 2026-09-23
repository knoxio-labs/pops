/**
 * Real-boundary harness for the inventory MCP tool suites.
 *
 * Every `*.test.ts` alongside these tool files exercises the tool handlers
 * against `vi.mock('../pillar-client.js')` — a mocked producer, never real
 * serialization or a real HTTP round trip. This harness instead boots real
 * `registry` and `inventory` OS processes (the same
 * `@pops/pillar-sdk/testing` helpers `pillars/bfm/src/api/inventory/
 * __tests__/offline-replay.live-seam.test.ts` uses to boot Inventory on a
 * temp sqlite DB — reused rather than reinvented) and points the MCP layer's
 * own `pillar-client.ts` at them through the exact env vars and
 * `configureServerSdk` path production boot uses: real registry discovery,
 * a real `X-API-Key` service account, real REST serialization.
 *
 * A suite using this harness must call `resetPillarClientEnv()` (or let
 * `startLiveSeam`'s `afterAll` do it) before any other live-seam test in the
 * same process re-configures the client, since `configureServerSdk` merges
 * into module-level state shared across the whole vitest worker.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  waitForRegistration,
  type SpawnedPillarProcess,
} from '@pops/pillar-sdk/testing';

import { __resetPillarClientForTests } from '../../pillar-client.js';

const INVENTORY_PILLAR_ID = 'inventory';

/**
 * The MCP service account's real grant for inventory (README, "Who may call
 * it"): the root scope, which authorises every `inventory.*` route via
 * `hasScopeFor`'s prefix match.
 */
export const FULL_INVENTORY_SCOPES: readonly string[] = ['inventory'];

const serviceAccountSchema = z.object({ plaintextKey: z.string().min(1) });

async function mintServiceAccount(
  registryBaseUrl: string,
  name: string,
  scopes: readonly string[]
): Promise<string> {
  const response = await fetch(`${registryBaseUrl}/service-accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name, scopes }),
  });
  const body: unknown = await response.json();
  if (!response.ok) {
    throw new Error(
      `minting service account failed: HTTP ${String(response.status)}: ${JSON.stringify(body)}`
    );
  }
  return serviceAccountSchema.parse(body).plaintextKey;
}

export interface LiveSeam {
  readonly registryBaseUrl: string;
  readonly inventoryBaseUrl: string;
  /** A service account key carrying every inventory scope MCP is granted in production. */
  readonly apiKey: string;
  /** Mints an additional service account with an arbitrary scope set, e.g. `[]` for a 401 test. */
  mintKey(name: string, scopes: readonly string[]): Promise<string>;
  /** Points the MCP `pillar-client` at this harness's registry using `apiKey`. */
  useDefaultKey(): void;
  /** Points the MCP `pillar-client` at this harness's registry using an arbitrary key. */
  useKey(apiKey: string): void;
  stop(): Promise<void>;
}

/**
 * Undoes whatever env vars a live-seam test set on `process.env` and drops
 * `pillar-client.ts`'s boot guard, so the next `ensureConfigured()` call
 * re-bootstraps from scratch instead of reusing a previous suite's registry.
 */
export function resetPillarClientEnv(): void {
  delete process.env['POPS_REGISTRY_URL'];
  delete process.env['POPS_INTERNAL_API_KEY'];
  delete process.env['POPS_API_KEY'];
  delete process.env['POPS_INVENTORY_API_URL'];
  __resetPillarClientForTests();
}

/**
 * Boots a real registry and a real inventory process (temp sqlite, no
 * shared state with any other test) and mints a full-scope service account.
 * Call `stop()` in `afterAll`; call `useDefaultKey()`/`useKey()` before every
 * `it()` that reads `pillar-client.ts` state, since another live-seam file
 * in the same worker may have repointed it.
 */
export async function startLiveSeam(callerImportMetaUrl: string): Promise<LiveSeam> {
  const tempDir = mkdtempSync(join(tmpdir(), 'mcp-live-seam-'));

  const registryProcess = await spawnPillarProcess({
    label: 'registry',
    cwd: resolvePillarDir(callerImportMetaUrl, 'registry'),
    port: await getFreePort(),
    env: { POPS_REGISTRY_ENABLED: 'true', REGISTRY_SQLITE_PATH: join(tempDir, 'registry.db') },
  });

  const inventoryPort = await getFreePort();
  const inventoryProcess: SpawnedPillarProcess = await spawnPillarProcess({
    label: 'inventory',
    cwd: resolvePillarDir(callerImportMetaUrl, INVENTORY_PILLAR_ID),
    port: inventoryPort,
    env: {
      POPS_REGISTRY_ENABLED: 'true',
      POPS_REGISTRY_URL: registryProcess.baseUrl,
      INVENTORY_SQLITE_PATH: join(tempDir, 'inventory.db'),
      INVENTORY_SELF_BASE_URL: `http://127.0.0.1:${String(inventoryPort)}`,
    },
  });
  await waitForRegistration(registryProcess.baseUrl, INVENTORY_PILLAR_ID);

  const apiKey = await mintServiceAccount(
    registryProcess.baseUrl,
    'mcp-live-seam',
    FULL_INVENTORY_SCOPES
  );

  function useKey(key: string): void {
    resetPillarClientEnv();
    process.env['POPS_REGISTRY_URL'] = registryProcess.baseUrl;
    process.env['POPS_INTERNAL_API_KEY'] = key;
  }

  return {
    registryBaseUrl: registryProcess.baseUrl,
    inventoryBaseUrl: inventoryProcess.baseUrl,
    apiKey,
    mintKey: (name, scopes) => mintServiceAccount(registryProcess.baseUrl, name, scopes),
    useDefaultKey: () => useKey(apiKey),
    useKey,
    stop: async () => {
      resetPillarClientEnv();
      await inventoryProcess.stop();
      await registryProcess.stop();
      rmSync(tempDir, { recursive: true, force: true });
    },
  };
}
