import { describe, expect, it } from 'vitest';

import { REGISTRY_SERVICE_ACCOUNT_SELF_PATH } from '../../registry-paths.js';
import { createRegistryServiceAccountVerifier } from '../service-account-verifier.js';

const KEY = 'pops_sa_abcdefgh.secret-value';
const PRINCIPAL = { id: 'sa_1', name: 'bfm', scopes: ['finance.transactions'] };

type Call = { url: string; headers: Record<string, string> };

function recordingFetch(responder: (call: number) => Response): {
  fetchImpl: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetchImpl = ((input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return Promise.resolve(responder(calls.length));
  }) as typeof fetch;
  return { fetchImpl, calls };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('createRegistryServiceAccountVerifier', () => {
  it('presents the key under verification to the registry self route', async () => {
    const { fetchImpl, calls } = recordingFetch(() => json(PRINCIPAL));
    const verify = createRegistryServiceAccountVerifier({
      registryUrl: 'http://registry-api:3001/',
      fetchImpl,
    });

    await expect(verify(KEY)).resolves.toEqual({ outcome: 'authenticated', principal: PRINCIPAL });
    expect(calls[0]?.url).toBe(`http://registry-api:3001${REGISTRY_SERVICE_ACCOUNT_SELF_PATH}`);
    expect(calls[0]?.headers['x-api-key']).toBe(KEY);
  });

  it('reads a 401 as a rejection — an unknown or revoked key', async () => {
    const { fetchImpl } = recordingFetch(() => json({ message: 'nope' }, 401));
    const verify = createRegistryServiceAccountVerifier({ fetchImpl });
    await expect(verify(KEY)).resolves.toEqual({ outcome: 'rejected' });
  });

  it('reads a 404 as unavailable, not as a rejection', async () => {
    const { fetchImpl } = recordingFetch(() => json({ message: 'not found' }, 404));
    const verify = createRegistryServiceAccountVerifier({ fetchImpl });
    const result = await verify(KEY);
    expect(result.outcome).toBe('unavailable');
  });

  it('reads a network failure as unavailable', async () => {
    const fetchImpl = (() => Promise.reject(new Error('ECONNREFUSED'))) as typeof fetch;
    const verify = createRegistryServiceAccountVerifier({ fetchImpl });
    await expect(verify(KEY)).resolves.toMatchObject({
      outcome: 'unavailable',
      detail: 'ECONNREFUSED',
    });
  });

  it('reads an unreadable principal as unavailable rather than trusting it', async () => {
    const { fetchImpl } = recordingFetch(() => json({ id: 'sa_1', name: 'bfm', scopes: [1, 2] }));
    const verify = createRegistryServiceAccountVerifier({ fetchImpl });
    expect((await verify(KEY)).outcome).toBe('unavailable');
  });

  it('serves a cached principal without a second round-trip', async () => {
    const { fetchImpl, calls } = recordingFetch(() => json(PRINCIPAL));
    const verify = createRegistryServiceAccountVerifier({ fetchImpl, cacheTtlMs: 30_000 });

    await verify(KEY);
    await verify(KEY);
    expect(calls).toHaveLength(1);
  });

  it('caches per key, so one account cannot vouch for another', async () => {
    const { fetchImpl, calls } = recordingFetch((n) =>
      n === 1 ? json(PRINCIPAL) : json({ message: 'nope' }, 401)
    );
    const verify = createRegistryServiceAccountVerifier({ fetchImpl });

    expect((await verify(KEY)).outcome).toBe('authenticated');
    expect((await verify('pops_sa_other.key')).outcome).toBe('rejected');
    expect(calls).toHaveLength(2);
  });

  it('re-asks once the TTL lapses, so a revocation lands', async () => {
    let clock = 0;
    const { fetchImpl, calls } = recordingFetch((n) =>
      n === 1 ? json(PRINCIPAL) : json({ message: 'revoked' }, 401)
    );
    const verify = createRegistryServiceAccountVerifier({
      fetchImpl,
      cacheTtlMs: 30_000,
      now: () => clock,
    });

    expect((await verify(KEY)).outcome).toBe('authenticated');
    clock = 30_001;
    expect((await verify(KEY)).outcome).toBe('rejected');
    expect(calls).toHaveLength(2);
  });

  it('never caches an unavailable answer', async () => {
    const { fetchImpl, calls } = recordingFetch((n) => (n === 1 ? json({}, 500) : json(PRINCIPAL)));
    const verify = createRegistryServiceAccountVerifier({ fetchImpl });

    expect((await verify(KEY)).outcome).toBe('unavailable');
    expect((await verify(KEY)).outcome).toBe('authenticated');
    expect(calls).toHaveLength(2);
  });

  it('caps the cache so invented keys cannot grow it without bound', async () => {
    const { fetchImpl, calls } = recordingFetch(() => json({ message: 'nope' }, 401));
    const verify = createRegistryServiceAccountVerifier({ fetchImpl, maxCacheEntries: 2 });

    await verify('a');
    await verify('b');
    await verify('c');
    // 'a' was evicted to make room for 'c', so asking again costs a round-trip.
    await verify('a');
    expect(calls).toHaveLength(4);
  });
});
