import { describe, expect, it } from 'vitest';

import { probePillar } from '../reachability.js';
import { contractResponse, pillarSnapshot } from './fixtures.js';

function probe(fetchImpl: typeof fetch) {
  return probePillar(pillarSnapshot('finance'), {
    fetchImpl,
    timeoutMs: 50,
    baseUrlOverrides: {},
  });
}

describe('transient pillar probe failures', () => {
  it('retries a failed request and reports healthy when the retry succeeds', async () => {
    let requests = 0;
    const fetchImpl: typeof fetch = async () => {
      requests += 1;
      if (requests === 1) throw new Error('ECONNRESET');
      return contractResponse();
    };

    await expect(probe(fetchImpl)).resolves.toBe('healthy');
    expect(requests).toBe(2);
  });

  it('reports unavailable after both requests fail', async () => {
    let requests = 0;
    const fetchImpl: typeof fetch = async () => {
      requests += 1;
      throw new Error('ECONNREFUSED');
    };

    await expect(probe(fetchImpl)).resolves.toBe('unavailable');
    expect(requests).toBe(2);
  });

  it('does not retry a completed response without a usable contract', async () => {
    let requests = 0;
    const fetchImpl: typeof fetch = async () => {
      requests += 1;
      return new Response('unavailable', { status: 503 });
    };

    await expect(probe(fetchImpl)).resolves.toBe('contract-mismatch');
    expect(requests).toBe(1);
  });
});
