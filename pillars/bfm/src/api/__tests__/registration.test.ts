/**
 * Proves the boot ordering `server.ts` relies on: an unavailable registry
 * delays bfm's self-registration and nothing else. If `bootstrapPillar` ever
 * became blocking, a registry outage would hold the whole fleet's cold start
 * hostage — a pillar that cannot serve traffic until a *different* pillar
 * answers is the failure mode this asserts against.
 *
 * The registry is stubbed rather than reached: what is under test is this
 * pillar's boot contract, not the SDK's HTTP transport.
 */
import request from 'supertest';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  bootstrapPillar,
  RegistryNetworkError,
  type RegisterRequest,
  type RegistryTransport,
} from '@pops/pillar-sdk/bootstrap';

import { buildBfmManifest } from '../manifest.js';
import { createTestApp, type TestApp, type TestAppOptions } from './harness.js';

function recordingRegistry(): RegistryTransport & {
  lastRegister: () => RegisterRequest | undefined;
} {
  let last: RegisterRequest | undefined;
  return {
    lastRegister: () => last,
    register: (payload) => {
      last = payload;
      return Promise.resolve({ pillarId: payload.pillarId });
    },
    heartbeat: (pillarId) =>
      Promise.resolve({ pillarId, acknowledgedAt: new Date().toISOString() }),
    unregister: () => Promise.resolve(),
  };
}

function deadRegistry(): RegistryTransport & { registerAttempts: () => number } {
  let attempts = 0;
  return {
    registerAttempts: () => attempts,
    register: () => {
      attempts += 1;
      return Promise.reject(
        new RegistryNetworkError('registry unreachable', new Error('ECONNREFUSED'))
      );
    },
    heartbeat: () => Promise.reject(new Error('unreachable')),
    unregister: () => Promise.reject(new Error('unreachable')),
  };
}

const silentLogger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

const apps: TestApp[] = [];

function open(options: TestAppOptions = {}): TestApp {
  const created = createTestApp(options);
  apps.push(created);
  return created;
}

afterEach(() => {
  while (apps.length > 0) {
    apps.pop()?.cleanup();
  }
});

describe('self-registration against an unavailable registry', () => {
  it('resolves the bootstrap handle without waiting for the registry', async () => {
    const transport = deadRegistry();

    const handle = await bootstrapPillar({
      manifest: buildBfmManifest('1.2.3'),
      baseUrl: 'http://bfm-api:3014',
      transport,
      logger: silentLogger,
      registerInitialBackoffMs: 10_000,
      registerMaxBackoffMs: 10_000,
    });

    expect(handle.pillarId).toBe('bfm');
    await handle.stop();
  });

  it('keeps serving /health while registration is still retrying', async () => {
    const transport = deadRegistry();
    const { app } = open({ version: '1.2.3' });

    const handle = await bootstrapPillar({
      manifest: buildBfmManifest('1.2.3'),
      baseUrl: 'http://bfm-api:3014',
      transport,
      logger: silentLogger,
      registerInitialBackoffMs: 10_000,
      registerMaxBackoffMs: 10_000,
    });

    const res = await request(app).get('/health');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ ok: true, pillar: 'bfm' });
    expect(transport.registerAttempts()).toBeGreaterThan(0);

    await handle.stop();
  });

  it('retries a registry that is down rather than giving up on the fleet', async () => {
    const transport = deadRegistry();

    const handle = await bootstrapPillar({
      manifest: buildBfmManifest('1.2.3'),
      baseUrl: 'http://bfm-api:3014',
      transport,
      logger: silentLogger,
      registerInitialBackoffMs: 1,
      registerMaxBackoffMs: 1,
    });

    await vi.waitFor(() => {
      expect(transport.registerAttempts()).toBeGreaterThan(2);
    });

    await handle.stop();
  });

  it('abandons the retry loop on shutdown instead of leaking it', async () => {
    const transport = deadRegistry();

    const handle = await bootstrapPillar({
      manifest: buildBfmManifest('1.2.3'),
      baseUrl: 'http://bfm-api:3014',
      transport,
      logger: silentLogger,
      registerInitialBackoffMs: 60_000,
      registerMaxBackoffMs: 60_000,
    });

    await expect(handle.stop()).resolves.toBeUndefined();

    const attemptsAtStop = transport.registerAttempts();
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(transport.registerAttempts()).toBe(attemptsAtStop);
  });
});

/**
 * The README tells operators to correlate a deployed build through the
 * registry rather than `/health`, because the two disagree for the default
 * `BUILD_VERSION=dev`. That claim spans this pillar and the SDK, so nothing in
 * either alone can keep it honest — these pin the seam, and go red if the SDK
 * ever stops coercing.
 */
describe('BUILD_VERSION on the wire', () => {
  it('registers a non-semver version coerced, with the contract tag rewritten to match', async () => {
    const transport = recordingRegistry();

    const handle = await bootstrapPillar({
      manifest: buildBfmManifest('dev'),
      baseUrl: 'http://bfm-api:3014',
      transport,
      logger: silentLogger,
    });

    const registered = transport.lastRegister();
    expect(registered?.manifest.version).toBe('0.0.0-sha.dev');
    expect(registered?.manifest.contract.version).toBe('0.0.0-sha.dev');
    expect(registered?.manifest.contract.tag).toBe('contract-bfm@v0.0.0-sha.dev');

    await handle.stop();
  });

  it('leaves a semver version untouched', async () => {
    const transport = recordingRegistry();

    const handle = await bootstrapPillar({
      manifest: buildBfmManifest('1.2.3'),
      baseUrl: 'http://bfm-api:3014',
      transport,
      logger: silentLogger,
    });

    expect(transport.lastRegister()?.manifest.version).toBe('1.2.3');

    await handle.stop();
  });

  it('reports the raw value on /health, which is why the two can disagree', async () => {
    const { app } = open({ version: 'dev' });

    const res = await request(app).get('/health');

    expect(res.body.version).toBe('dev');
  });
});
