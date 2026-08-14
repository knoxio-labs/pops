/**
 * The assembled payload, driven through fakes for the registry and the probe.
 *
 * `bootstrap-route.test.ts` covers the same ground through the real HTTP
 * surface and the real perimeter. This file is where the branches live —
 * particularly the one that must not exist as a `500`: a registry bfm cannot
 * reach has to produce a phone that boots, not a phone stuck on a splash
 * screen because a sibling container blinked.
 */
import { eq } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { RegistryUnreachableError } from '@pops/pillar-sdk/discovery';

import { deviceRow, openTempDb, requireRow } from '../../../db/__tests__/helpers.js';
import { devices } from '../../../db/index.js';
import {
  buildMobileBootstrap,
  defaultMobileBootstrapDeps,
  type MobileBootstrapDeps,
} from '../bootstrap.js';
import { DEFAULT_PROBE_TIMEOUT_MS } from '../reachability.js';
import { contractResponse, fakeFetch, pillarSnapshot, registrySnapshot } from './fixtures.js';

import type { BfmDb, DeviceInsert, DeviceRow } from '../../../db/index.js';

const opened: { cleanup: () => void }[] = [];

afterEach(() => {
  vi.restoreAllMocks();
  while (opened.length > 0) opened.pop()?.cleanup();
});

function seededDb(row: DeviceInsert & { id: string }): { db: BfmDb; device: DeviceRow } {
  const temp = openTempDb();
  opened.push(temp);
  temp.opened.db.insert(devices).values(row).run();
  const device = requireRow(
    temp.opened.db.select().from(devices).where(eq(devices.id, row.id)).get(),
    'seeded device'
  );
  return { db: temp.opened.db, device };
}

function healthyFleet(...ids: string[]): Pick<MobileBootstrapDeps, 'readRegistry' | 'probe'> {
  const answers = Object.fromEntries(
    ids.map((id) => [`http://${id}-api:3000/openapi`, contractResponse])
  );
  return {
    readRegistry: () => Promise.resolve(registrySnapshot(ids.map((id) => pillarSnapshot(id)))),
    probe: { fetchImpl: fakeFetch(answers).fetchImpl, timeoutMs: 50, baseUrlOverrides: {} },
  };
}

function depsFor(
  db: BfmDb,
  overrides: Partial<MobileBootstrapDeps> = {},
  at = '2026-08-08T10:00:00.000Z'
): MobileBootstrapDeps {
  return {
    db,
    now: () => new Date(at),
    ...healthyFleet('finance'),
    ...overrides,
  };
}

describe('a federation that is entirely healthy', () => {
  it('reports every pillar and turns the features on', async () => {
    const { db, device } = seededDb(deviceRow());

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, healthyFleet('finance', 'food'))
    );

    expect(payload.registry.source).toBe('fresh');
    expect(payload.pillars).toEqual([
      { id: 'finance', reachability: 'healthy' },
      { id: 'food', reachability: 'healthy' },
    ]);
    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'healthy' },
      { id: 'receipt-capture', reachability: 'unavailable' },
    ]);
  });

  it('leaves bfm out of the list it is answering with', async () => {
    // bfm self-registers, so it is in its own snapshot. Probing it would ask,
    // over the network, whether the process writing this response is up — and
    // a route that does not resolve from inside the container would declare
    // bfm unavailable in a payload bfm is serving.
    const { db, device } = seededDb(deviceRow());
    const { fetchImpl, requested } = fakeFetch({
      'http://finance-api:3000/openapi': contractResponse,
    });

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, {
        readRegistry: () =>
          Promise.resolve(registrySnapshot([pillarSnapshot('bfm'), pillarSnapshot('finance')])),
        probe: { fetchImpl, timeoutMs: 50, baseUrlOverrides: {} },
      })
    );

    expect(payload.pillars).toEqual([{ id: 'finance', reachability: 'healthy' }]);
    expect(requested).toEqual(['http://finance-api:3000/openapi']);
  });

  it('names the device back to itself', async () => {
    const { db, device } = seededDb(deviceRow({ name: 'Spare handset' }));

    const payload = await buildMobileBootstrap(device, depsFor(db));

    expect(payload.device.id).toBe(device.id);
    expect(payload.device.name).toBe('Spare handset');
  });
});

describe('a federation that is half-broken', () => {
  it('keeps one unreachable pillar from turning the rest off', async () => {
    const { db, device } = seededDb(deviceRow());
    const probe = {
      fetchImpl: ((input) =>
        String(input).includes('food')
          ? Promise.reject(new Error('ECONNREFUSED'))
          : Promise.resolve(contractResponse())) as typeof fetch,
      timeoutMs: 50,
      baseUrlOverrides: {},
    };

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, {
        readRegistry: () =>
          Promise.resolve(registrySnapshot([pillarSnapshot('finance'), pillarSnapshot('food')])),
        probe,
      })
    );

    expect(payload.pillars).toEqual([
      { id: 'finance', reachability: 'healthy' },
      { id: 'food', reachability: 'unavailable' },
    ]);
    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'healthy' },
      { id: 'receipt-capture', reachability: 'unavailable' },
    ]);
  });

  it('marks the feature unavailable when its own pillar is the one that is down', async () => {
    const { db, device } = seededDb(deviceRow());

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, {
        readRegistry: () =>
          Promise.resolve(registrySnapshot([pillarSnapshot('finance', { registered: false })])),
      })
    );

    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'unavailable' },
      { id: 'receipt-capture', reachability: 'unavailable' },
    ]);
  });

  it('marks receipts unavailable independently of transactions when only purchases is down', async () => {
    const { db, device } = seededDb(deviceRow());

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, {
        readRegistry: () =>
          Promise.resolve(
            registrySnapshot([
              pillarSnapshot('finance'),
              pillarSnapshot('purchases', { registered: false }),
            ])
          ),
      })
    );

    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'healthy' },
      { id: 'receipt-capture', reachability: 'unavailable' },
    ]);
  });

  it('marks receipts reachable when purchases answers', async () => {
    const { db, device } = seededDb(deviceRow());

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, healthyFleet('finance', 'purchases'))
    );

    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'healthy' },
      { id: 'receipt-capture', reachability: 'healthy' },
    ]);
  });

  it('keeps contract-mismatch distinct from unavailable all the way to the feature', async () => {
    const { db, device } = seededDb(deviceRow());
    const probe = {
      fetchImpl: (() => Promise.resolve(new Response('nope', { status: 404 }))) as typeof fetch,
      timeoutMs: 50,
      baseUrlOverrides: {},
    };

    const payload = await buildMobileBootstrap(device, depsFor(db, { probe }));

    expect(payload.pillars).toEqual([{ id: 'finance', reachability: 'contract-mismatch' }]);
    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'contract-mismatch' },
      { id: 'receipt-capture', reachability: 'unavailable' },
    ]);
  });
});

describe('a registry serving something less than the truth', () => {
  it('passes the cache source straight through so the app knows how stale it is', async () => {
    const { db, device } = seededDb(deviceRow());

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, {
        readRegistry: () =>
          Promise.resolve(registrySnapshot([pillarSnapshot('finance')], 'stale-fallback')),
      })
    );

    expect(payload.registry.source).toBe('stale-fallback');
    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'healthy' },
      { id: 'receipt-capture', reachability: 'unavailable' },
    ]);
  });

  it('degrades rather than throwing when the registry cannot be reached at all', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db, device } = seededDb(deviceRow());

    const payload = await buildMobileBootstrap(
      device,
      depsFor(db, {
        readRegistry: () =>
          Promise.reject(new RegistryUnreachableError('registry unreachable', { attempts: 1 })),
      })
    );

    expect(payload.registry.source).toBe('unavailable');
    expect(payload.pillars).toEqual([]);
    expect(payload.features).toEqual([
      { id: 'transactions', reachability: 'unavailable' },
      { id: 'receipt-capture', reachability: 'unavailable' },
    ]);
  });

  it('says so in the log, since only an operator can act on it', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db, device } = seededDb(deviceRow());

    await buildMobileBootstrap(
      device,
      depsFor(db, {
        readRegistry: () =>
          Promise.reject(new RegistryUnreachableError('registry unreachable', { attempts: 3 })),
      })
    );

    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('3 attempt');
  });

  it('lets a fault that is not an outage propagate rather than dressing it up', async () => {
    // The SDK folds every reachability failure into a value. An exception
    // arriving here is a bug in this process, and reporting it as an unhealthy
    // federation would send an operator to look at the wrong container.
    const { db, device } = seededDb(deviceRow());
    const boom = new TypeError('readRegistry is not a function');

    await expect(
      buildMobileBootstrap(device, depsFor(db, { readRegistry: () => Promise.reject(boom) }))
    ).rejects.toThrow(boom);
  });
});

describe('recording the check-in', () => {
  function lastSeen(db: BfmDb, id: string): string {
    return requireRow(db.select().from(devices).where(eq(devices.id, id)).get(), 'device')
      .lastSeenAt;
  }

  it('advances lastSeenAt on the row', async () => {
    const { db, device } = seededDb(deviceRow());
    const before = lastSeen(db, device.id);

    await buildMobileBootstrap(device, depsFor(db, {}, '2027-01-01T00:00:00.000Z'));

    const after = lastSeen(db, device.id);
    expect(after).toBe('2027-01-01T00:00:00.000Z');
    expect(after > before).toBe(true);
  });

  it('advances it again on the next launch', async () => {
    const { db, device } = seededDb(deviceRow());

    const first = await buildMobileBootstrap(device, depsFor(db, {}, '2027-01-01T00:00:00.000Z'));
    const second = await buildMobileBootstrap(device, depsFor(db, {}, '2027-01-01T00:05:00.000Z'));

    expect(second.device.lastSeenAt > first.device.lastSeenAt).toBe(true);
  });

  it('returns the instant it wrote, so the response and the row cannot disagree', async () => {
    const { db, device } = seededDb(deviceRow());

    const payload = await buildMobileBootstrap(device, depsFor(db, {}, '2027-03-04T05:06:07.008Z'));

    expect(payload.device.lastSeenAt).toBe(lastSeen(db, device.id));
  });

  it('records the check-in even when the whole federation is unreachable', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { db, device } = seededDb(deviceRow());

    await buildMobileBootstrap(
      device,
      depsFor(
        db,
        {
          readRegistry: () =>
            Promise.reject(new RegistryUnreachableError('registry unreachable', { attempts: 1 })),
        },
        '2027-02-02T02:02:02.002Z'
      )
    );

    expect(lastSeen(db, device.id)).toBe('2027-02-02T02:02:02.002Z');
  });

  it('touches only the device that called', async () => {
    const mine = deviceRow({ name: 'Mine' });
    const { db, device } = seededDb(mine);
    const other = deviceRow({ name: 'Other' });
    db.insert(devices).values(other).run();
    const otherBefore = lastSeen(db, other.id);

    await buildMobileBootstrap(device, depsFor(db, {}, '2027-05-05T05:05:05.005Z'));

    expect(lastSeen(db, other.id)).toBe(otherBefore);
  });
});

describe('defaultMobileBootstrapDeps', () => {
  it("leaves the probe's own default timeout in place when none is given", () => {
    const { db } = seededDb(deviceRow());

    const deps = defaultMobileBootstrapDeps(db, {});

    expect(deps.probe.timeoutMs).toBe(DEFAULT_PROBE_TIMEOUT_MS);
  });

  it('passes a caller-supplied probe timeout straight through', () => {
    const { db } = seededDb(deviceRow());

    const deps = defaultMobileBootstrapDeps(db, {}, 8_000);

    expect(deps.probe.timeoutMs).toBe(8_000);
  });

  it('carries the base-URL overrides onto the probe', () => {
    const { db } = seededDb(deviceRow());

    const deps = defaultMobileBootstrapDeps(db, { finance: 'http://localhost:3010' });

    expect(deps.probe.baseUrlOverrides).toEqual({ finance: 'http://localhost:3010' });
  });
});
