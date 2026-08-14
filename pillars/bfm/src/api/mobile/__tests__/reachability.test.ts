/**
 * What the probe concludes, and how much it is allowed to cost.
 *
 * The assertions worth reading twice are the ones separating `unavailable`
 * from `contract-mismatch`. Everything else in this file is bookkeeping; those
 * two are the reason the endpoint exists, and a change that collapses them
 * would leave every other test here green.
 */
import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PROBE_TIMEOUT_MS,
  defaultProbeDeps,
  probeFederation,
  probePillar,
  type ReachabilityProbeDeps,
} from '../reachability.js';
import { contractResponse, fakeFetch, pillarSnapshot } from './fixtures.js';

function deps(overrides: Partial<ReachabilityProbeDeps> = {}): ReachabilityProbeDeps {
  return {
    fetchImpl: fakeFetch({}).fetchImpl,
    timeoutMs: 50,
    baseUrlOverrides: {},
    ...overrides,
  };
}

const FINANCE_CONTRACT_URL = 'http://finance-api:3000/openapi';

describe('a pillar the registry has already ruled out', () => {
  it('is unavailable when it is not registered, without a probe', async () => {
    const { fetchImpl, requested } = fakeFetch({});

    const reachability = await probePillar(
      pillarSnapshot('finance', { registered: false }),
      deps({ fetchImpl })
    );

    expect(reachability).toBe('unavailable');
    // Not an optimisation. `pillar()` refuses this call on exactly this basis,
    // so a probe that answered `healthy` here would promise the app a feature
    // every subsequent request then fails to deliver.
    expect(requested).toEqual([]);
  });

  it('is unavailable when the registry says its healthcheck failed', async () => {
    const { fetchImpl, requested } = fakeFetch({});

    const reachability = await probePillar(
      pillarSnapshot('finance', { status: 'unavailable' }),
      deps({ fetchImpl })
    );

    expect(reachability).toBe('unavailable');
    expect(requested).toEqual([]);
  });

  it('is degraded — not unavailable — while the registry is still reconciling', async () => {
    const reachability = await probePillar(
      pillarSnapshot('finance', { status: 'unknown', registered: true }),
      deps()
    );

    expect(reachability).toBe('degraded');
  });
});

describe('a pillar the registry vouches for', () => {
  it('is healthy when it serves a JSON contract', async () => {
    const { fetchImpl } = fakeFetch({ [FINANCE_CONTRACT_URL]: contractResponse });

    const reachability = await probePillar(pillarSnapshot('finance'), deps({ fetchImpl }));

    expect(reachability).toBe('healthy');
  });

  it('is healthy when a legacy snapshot carries no status field at all', async () => {
    const { fetchImpl } = fakeFetch({ [FINANCE_CONTRACT_URL]: contractResponse });
    const entry = pillarSnapshot('finance');
    delete entry.status;

    const reachability = await probePillar(entry, deps({ fetchImpl }));

    expect(reachability).toBe('healthy');
  });

  it('probes the contract route, not the health route', async () => {
    const { fetchImpl, requested } = fakeFetch({ [FINANCE_CONTRACT_URL]: contractResponse });

    await probePillar(pillarSnapshot('finance'), deps({ fetchImpl }));

    expect(requested).toEqual([FINANCE_CONTRACT_URL]);
  });

  it('does not double the slash when the registry advertises a trailing one', async () => {
    const { fetchImpl, requested } = fakeFetch({ [FINANCE_CONTRACT_URL]: contractResponse });

    await probePillar(
      pillarSnapshot('finance', { baseUrl: 'http://finance-api:3000/' }),
      deps({ fetchImpl })
    );

    expect(requested).toEqual([FINANCE_CONTRACT_URL]);
  });

  it('follows the internal base-URL override rather than the advertised host', async () => {
    // The overrides the server SDK applies to outbound calls have to apply
    // here too, or a laptop reports a federation it is perfectly able to call.
    const { fetchImpl, requested } = fakeFetch({
      'http://localhost:3010/openapi': contractResponse,
    });

    const reachability = await probePillar(
      pillarSnapshot('finance'),
      deps({ fetchImpl, baseUrlOverrides: { finance: 'http://localhost:3010' } })
    );

    expect(reachability).toBe('healthy');
    expect(requested).toEqual(['http://localhost:3010/openapi']);
  });
});

describe('the two failures that must never be one', () => {
  it('reads a refused connection as unavailable — nobody answered', async () => {
    const fetchImpl: typeof fetch = () => Promise.reject(new Error('ECONNREFUSED'));

    const reachability = await probePillar(pillarSnapshot('finance'), deps({ fetchImpl }));

    expect(reachability).toBe('unavailable');
  });

  it('reads a missing contract as contract-mismatch — it answered, uncallably', async () => {
    const { fetchImpl } = fakeFetch({
      [FINANCE_CONTRACT_URL]: () => new Response('Not Found', { status: 404 }),
    });

    const reachability = await probePillar(pillarSnapshot('finance'), deps({ fetchImpl }));

    expect(reachability).toBe('contract-mismatch');
  });

  it('reads a 200 that is not JSON as contract-mismatch', async () => {
    // The fleet has already paid for this one: a misrouted proxy answering
    // `200 text/html` for an API path is indistinguishable from a healthy
    // pillar until something reads the content type.
    const { fetchImpl } = fakeFetch({
      [FINANCE_CONTRACT_URL]: () =>
        new Response('<!doctype html><title>shell</title>', {
          status: 200,
          headers: { 'content-type': 'text/html; charset=utf-8' },
        }),
    });

    const reachability = await probePillar(pillarSnapshot('finance'), deps({ fetchImpl }));

    expect(reachability).toBe('contract-mismatch');
  });

  it('reads a 500 as contract-mismatch, since the process is plainly answering', async () => {
    const { fetchImpl } = fakeFetch({
      [FINANCE_CONTRACT_URL]: () => new Response('boom', { status: 500 }),
    });

    const reachability = await probePillar(pillarSnapshot('finance'), deps({ fetchImpl }));

    expect(reachability).toBe('contract-mismatch');
  });
});

describe('the probe is bounded in time', () => {
  it('gives up on a pillar that never answers, and calls it unavailable', async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => {
          reject(new Error('aborted'));
        });
      });

    const reachability = await probePillar(
      pillarSnapshot('finance'),
      deps({ fetchImpl, timeoutMs: 1 })
    );

    expect(reachability).toBe('unavailable');
  });

  it('hands every probe an abort signal, which is what makes the deadline real', async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetchImpl: typeof fetch = (_input, init) => {
      signals.push(init?.signal);
      return Promise.resolve(contractResponse());
    };

    await probePillar(pillarSnapshot('finance'), deps({ fetchImpl }));

    expect(signals).toHaveLength(1);
    expect(signals[0]).toBeInstanceOf(AbortSignal);
  });
});

describe('the fan-out across the federation', () => {
  it('probes every pillar concurrently, so one slow host costs one deadline', async () => {
    // Asserted structurally rather than by wall clock: a timing assertion of
    // this shape is the kind that passes on a laptop and flakes in CI.
    let inFlight = 0;
    let peak = 0;
    let release = (): void => {};
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const fetchImpl: typeof fetch = async () => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await held;
      inFlight -= 1;
      return contractResponse();
    };

    const probing = probeFederation(
      ['finance', 'media', 'food'].map((id) => pillarSnapshot(id)),
      deps({ fetchImpl })
    );
    await Promise.resolve();
    release();

    expect(await probing).toHaveLength(3);
    expect(peak).toBe(3);
  });

  it('returns pillars sorted by id, so two identical launches read identically', async () => {
    const fetchImpl: typeof fetch = () => Promise.resolve(contractResponse());

    const probed = await probeFederation(
      ['media', 'finance', 'food'].map((id) => pillarSnapshot(id)),
      deps({ fetchImpl })
    );

    expect(probed.map((entry) => entry.id)).toEqual(['finance', 'food', 'media']);
  });

  it('lets one unreachable pillar sit beside healthy ones rather than sinking them', async () => {
    const fetchImpl: typeof fetch = (input) =>
      String(input).includes('media')
        ? Promise.reject(new Error('ECONNREFUSED'))
        : Promise.resolve(contractResponse());

    const probed = await probeFederation(
      ['finance', 'media'].map((id) => pillarSnapshot(id)),
      deps({ fetchImpl })
    );

    expect(probed).toEqual([
      { id: 'finance', reachability: 'healthy' },
      { id: 'media', reachability: 'unavailable' },
    ]);
  });

  it('answers with an empty list for an empty federation', async () => {
    expect(await probeFederation([], deps())).toEqual([]);
  });
});

describe('defaultProbeDeps', () => {
  it('defaults to DEFAULT_PROBE_TIMEOUT_MS and no overrides when called bare', () => {
    const probeDeps = defaultProbeDeps();

    expect(probeDeps.timeoutMs).toBe(DEFAULT_PROBE_TIMEOUT_MS);
    expect(probeDeps.baseUrlOverrides).toEqual({});
    expect(probeDeps.fetchImpl).toBe(fetch);
  });

  it('carries the base-URL overrides handed to it', () => {
    const probeDeps = defaultProbeDeps({ finance: 'http://localhost:3010' });

    expect(probeDeps.baseUrlOverrides).toEqual({ finance: 'http://localhost:3010' });
  });

  it('uses a caller-supplied timeout instead of the default', () => {
    const probeDeps = defaultProbeDeps({}, 8_000);

    expect(probeDeps.timeoutMs).toBe(8_000);
  });
});
