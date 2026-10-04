import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RegistryUnreachableError } from '@pops/pillar-sdk/discovery';

import { deviceRow, openTempDb, requireRow } from '../../../db/__tests__/helpers.js';
import { devices } from '../../../db/index.js';
import { buildMobileBootstrap, type MobileBootstrapDeps } from '../bootstrap.js';
import { fakeFetch, registrySnapshot } from './fixtures.js';

import type { BfmDb, DeviceInsert, DeviceRow } from '../../../db/index.js';

const opened: { cleanup: () => void }[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (opened.length > 0) opened.pop()?.cleanup();
});

function seededDevice(): { db: BfmDb; device: DeviceRow } {
  const row: DeviceInsert & { id: string } = deviceRow();
  const temp = openTempDb();
  opened.push(temp);
  temp.opened.db.insert(devices).values(row).run();
  const device = requireRow(
    temp.opened.db.select().from(devices).where(eq(devices.id, row.id)).get(),
    'seeded device'
  );
  return { db: temp.opened.db, device };
}

function deps(
  db: BfmDb,
  readRegistry: () => Promise<ReturnType<typeof registrySnapshot>>
): MobileBootstrapDeps {
  return {
    db,
    readRegistry,
    probe: { fetchImpl: fakeFetch({}).fetchImpl, timeoutMs: 50, baseUrlOverrides: {} },
    now: () => new Date('2026-08-08T10:00:00.000Z'),
  };
}

describe('transient registry read failures', () => {
  it('retries once and reports the registry when the retry succeeds', async () => {
    const { db, device } = seededDevice();
    let reads = 0;
    const readRegistry = async () => {
      reads += 1;
      if (reads === 1) {
        throw new RegistryUnreachableError('registry unreachable', { attempts: 1 });
      }
      return registrySnapshot([]);
    };

    const payload = await buildMobileBootstrap(device, deps(db, readRegistry));

    expect(payload.registry.source).toBe('fresh');
    expect(payload.pillars).toEqual([]);
    expect(reads).toBe(2);
  });

  it('keeps the unavailable fallback after both reads fail', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db, device } = seededDevice();
    let reads = 0;
    const readRegistry = async () => {
      reads += 1;
      throw new RegistryUnreachableError('registry unreachable', { attempts: 1 });
    };

    const payload = await buildMobileBootstrap(device, deps(db, readRegistry));

    expect(payload.registry.source).toBe('unavailable');
    expect(payload.pillars).toEqual([]);
    expect(reads).toBe(2);
    expect(String(vi.mocked(console.warn).mock.calls[0]?.[0])).toContain('two failed reads');
  });

  it('does not retry an error that is not a registry outage', async () => {
    const { db, device } = seededDevice();
    let reads = 0;
    const failure = new TypeError('invalid registry response');
    const readRegistry = async () => {
      reads += 1;
      throw failure;
    };

    await expect(buildMobileBootstrap(device, deps(db, readRegistry))).rejects.toThrow(failure);
    expect(reads).toBe(1);
  });
});
