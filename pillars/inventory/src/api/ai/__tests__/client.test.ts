/**
 * Unit tests for {@link createAiClient} driven against a hand-built stub of
 * the `ai` pillar handle (POPS-4081). These are the paths that matter for
 * `codes/suggest`'s fallback contract: no key, a rejected credential, a
 * failed or timed-out call, and a response that is not a same-set
 * permutation of the candidates it was given — every one degrades to
 * `undefined` rather than throwing or inventing a code.
 */
import { describe, expect, it, vi } from 'vitest';

import { createAiClient } from '../client.js';
import { ok, stubAiHandle, unauthorized, unavailable } from './stub-handle.js';

describe('createAiClient.rankCodeCandidates', () => {
  it('returns undefined when this process holds no service-account key', async () => {
    const client = createAiClient(() => null);

    const result = await client.rankCodeCandidates(['B001', 'B002'], { name: 'Box' });

    expect(result).toBeUndefined();
  });

  it('returns the ranked order when it is a permutation of the candidates', async () => {
    const rank = vi.fn(async () => ok({ data: { ranked: ['B002', 'B001'] } }));
    const client = createAiClient(() => stubAiHandle(rank));

    const result = await client.rankCodeCandidates(['B001', 'B002'], {
      name: 'Box',
      typeKey: 'storage_box',
    });

    expect(result).toEqual(['B002', 'B001']);
    expect(rank).toHaveBeenCalledWith({
      name: 'Box',
      typeKey: 'storage_box',
      candidates: ['B001', 'B002'],
    });
  });

  it('degrades to undefined when the ai pillar answers not-ok', async () => {
    const client = createAiClient(() => stubAiHandle(async () => unavailable()));

    const result = await client.rankCodeCandidates(['B001', 'B002'], { name: 'Box' });

    expect(result).toBeUndefined();
  });

  it('degrades to undefined and logs distinctly when the credential is rejected', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const client = createAiClient(() => stubAiHandle(async () => unauthorized('nope')));

    const result = await client.rankCodeCandidates(['B001', 'B002'], { name: 'Box' });

    expect(result).toBeUndefined();
    expect(error).toHaveBeenCalledWith(expect.stringContaining('rejected'));
    error.mockRestore();
  });

  it('degrades to undefined when the call throws (e.g. a timeout)', async () => {
    const client = createAiClient(() => stubAiHandle(() => Promise.reject(new Error('timeout'))));

    const result = await client.rankCodeCandidates(['B001', 'B002'], { name: 'Box' });

    expect(result).toBeUndefined();
  });

  it('rejects a response with a different code count as not a permutation', async () => {
    const client = createAiClient(() =>
      stubAiHandle(async () => ok({ data: { ranked: ['B001'] } }))
    );

    const result = await client.rankCodeCandidates(['B001', 'B002'], { name: 'Box' });

    expect(result).toBeUndefined();
  });

  it('never lets a substituted code (e.g. one a live item already holds) through', async () => {
    const client = createAiClient(() =>
      stubAiHandle(async () => ok({ data: { ranked: ['B001', 'HELD-CODE'] } }))
    );

    const result = await client.rankCodeCandidates(['B001', 'B002'], { name: 'Box' });

    expect(result).toBeUndefined();
  });

  it('rejects a response repeating one candidate instead of returning every one once', async () => {
    const client = createAiClient(() =>
      stubAiHandle(async () => ok({ data: { ranked: ['B001', 'B001'] } }))
    );

    const result = await client.rankCodeCandidates(['B001', 'B002'], { name: 'Box' });

    expect(result).toBeUndefined();
  });
});
