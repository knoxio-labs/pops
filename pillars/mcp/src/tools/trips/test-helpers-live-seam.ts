import { randomUUID } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  getFreePort,
  resolvePillarDir,
  spawnPillarProcess,
  startRecordingProxy,
  waitForRegistration,
} from '@pops/pillar-sdk/testing';

import { __resetPillarClientForTests } from '../../pillar-client.js';
import { openApiObject } from '../openapi-values.js';

import type { RecordingProxy, SpawnedPillarProcess } from '@pops/pillar-sdk/testing';

/** Real registry, Trips process/SQLite and observable SDK HTTP boundary, owned entirely by the test. */
export interface TripsLiveSeam {
  readonly proxy: RecordingProxy;
  readonly tripsBaseUrl: string;
  useDefaultKey(): void;
  useKey(key: string): void;
  mintKey(scopes: readonly string[]): Promise<string>;
  stop(): Promise<void>;
}

function resetClient(): void {
  delete process.env['POPS_INTERNAL_API_KEY'];
  delete process.env['POPS_API_KEY'];
  delete process.env['POPS_REGISTRY_URL'];
  __resetPillarClientForTests();
}

async function mintKey(registryUrl: string, scopes: readonly string[]): Promise<string> {
  const response = await fetch(`${registryUrl}/service-accounts`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ name: `mcp-trips-fixture-${randomUUID()}`, scopes }),
  });
  if (!response.ok)
    throw new Error(`Fixture service-account creation failed: HTTP ${response.status}`);
  const value: unknown = await response.json();
  const key = openApiObject(value, 'fixture service-account result')['plaintextKey'];
  if (typeof key !== 'string' || key.length === 0)
    throw new Error('Fixture service-account result omitted its key');
  return key;
}

async function startProcesses(
  callerUrl: string,
  tempDir: string,
  cleanups: (() => Promise<void>)[]
): Promise<{
  registry: SpawnedPillarProcess;
  trips: SpawnedPillarProcess;
  proxy: RecordingProxy;
}> {
  const registry = await spawnPillarProcess({
    label: 'registry',
    cwd: resolvePillarDir(callerUrl, 'registry'),
    port: await getFreePort(),
    env: { POPS_REGISTRY_ENABLED: 'true', REGISTRY_SQLITE_PATH: join(tempDir, 'registry.db') },
  });
  cleanups.push(() => registry.stop());
  const port = await getFreePort();
  const proxy = await startRecordingProxy(`http://127.0.0.1:${port}`);
  cleanups.push(() => proxy.stop());
  const trips = await spawnPillarProcess({
    label: 'trips',
    cwd: resolvePillarDir(callerUrl, 'trips'),
    port,
    env: {
      POPS_REGISTRY_ENABLED: 'true',
      POPS_REGISTRY_URL: registry.baseUrl,
      TRIPS_SQLITE_PATH: join(tempDir, 'trips.db'),
      TRIPS_SELF_BASE_URL: proxy.baseUrl,
    },
  });
  cleanups.push(() => trips.stop());
  await waitForRegistration(registry.baseUrl, 'trips');
  return { registry, trips, proxy };
}

/** Boot only loopback fixture processes with independent real databases under the repository's ignored tmp/. */
export async function startTripsLiveSeam(callerUrl: string): Promise<TripsLiveSeam> {
  const tripsDir = resolvePillarDir(callerUrl, 'trips');
  const scratch = resolve(tripsDir, '../../tmp');
  mkdirSync(scratch, { recursive: true });
  const tempDir = mkdtempSync(join(scratch, 'mcp-trips-live-'));
  const cleanups: (() => Promise<void>)[] = [];
  async function stop(): Promise<void> {
    resetClient();
    const errors: unknown[] = [];
    for (const cleanup of cleanups.toReversed()) {
      try {
        await cleanup();
      } catch (error) {
        errors.push(error);
      }
    }
    rmSync(tempDir, { recursive: true, force: true });
    if (errors.length > 0) throw new AggregateError(errors, 'Trips fixture cleanup failed');
  }
  try {
    const { registry, trips, proxy } = await startProcesses(callerUrl, tempDir, cleanups);
    const defaultKey = await mintKey(registry.baseUrl, ['trips']);
    function useKey(key: string): void {
      resetClient();
      process.env['POPS_REGISTRY_URL'] = registry.baseUrl;
      process.env['POPS_INTERNAL_API_KEY'] = key;
    }
    return {
      proxy,
      tripsBaseUrl: trips.baseUrl,
      useDefaultKey: () => useKey(defaultKey),
      useKey,
      mintKey: (scopes) => mintKey(registry.baseUrl, scopes),
      stop,
    };
  } catch (error) {
    try {
      await stop();
    } catch (cleanupError) {
      throw new AggregateError([error, cleanupError], 'Trips fixture startup and cleanup failed', {
        cause: error,
      });
    }
    throw error;
  }
}
