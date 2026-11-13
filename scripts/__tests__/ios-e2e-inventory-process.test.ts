import { spawn } from 'node:child_process';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { spawnInventoryPillar } from '../ios-e2e/inventory-pillar.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:child_process')>();
  return { ...original, spawn: vi.fn(() => new original.ChildProcess()) };
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

describe('the native harness inventory process', () => {
  it.each(['127.0.0.1', '::1'])('binds the explicitly selected host %s', (host) => {
    vi.stubEnv('INVENTORY_HOST', '192.0.2.1');
    const repoRoot = process.cwd();
    spawnInventoryPillar({
      repoRoot,
      port: 30123,
      host,
      dataDir: join(repoRoot, 'tmp', 'inventory-process-fixture'),
      buildVersion: 'inventory-process-fixture',
      selfBaseUrl: 'http://127.0.0.1:30123',
      registryUrl: 'http://127.0.0.1:30124',
    });
    expect(spawn).toHaveBeenCalledTimes(1);
    const call = vi.mocked(spawn).mock.calls[0];
    if (call === undefined) throw new Error('Expected an inventory process');
    const [command, args, options] = call;
    expect(command).toBe('node');
    expect(args).toEqual([join(repoRoot, 'pillars/inventory/dist/api/server.js')]);
    expect(options?.cwd).toBe(repoRoot);
    expect(options?.env?.['INVENTORY_HOST']).toBe(host);
    expect(options?.env?.['PORT']).toBe('30123');
  });
});
