import { describe, expect, it, vi } from 'vitest';

import { resolveCanonicalIds, type CanonicalIdentityOperation } from '../canonical-identities.js';
import { PillarCallError, PillarSdkError } from '../errors.js';

describe('resolveCanonicalIds', () => {
  it('preserves every historical id, duplicates, and explicit missing identities across batches', async () => {
    const operation = vi.fn<CanonicalIdentityOperation>(async (ids) => ({
      kind: 'ok',
      value: {
        revision: 7,
        data: ids.map((id) => ({ id, canonicalId: id === 'missing' ? null : 'canonical' })),
      },
    }));
    const result = await resolveCanonicalIds(
      ['old-one', 'old-two', 'old-one', 'missing'],
      operation,
      { batchSize: 2 }
    );
    expect([...result]).toEqual([
      ['old-one', 'canonical'],
      ['old-two', 'canonical'],
      ['missing', null],
    ]);
    expect(operation.mock.calls).toEqual([[['old-one', 'old-two']], [['old-one', 'missing']]]);
  });

  it('does not contact the producer for empty input', async () => {
    const operation = vi.fn<CanonicalIdentityOperation>();
    expect((await resolveCanonicalIds([], operation)).size).toBe(0);
    expect(operation).not.toHaveBeenCalled();
  });

  it('restarts all batches after a revision change', async () => {
    let call = 0;
    const operation = vi.fn<CanonicalIdentityOperation>(async (ids) => {
      call++;
      return {
        kind: 'ok',
        value: {
          revision: call === 1 ? 1 : 2,
          data: ids.map((id) => ({ id, canonicalId: call === 1 ? 'stale' : 'current' })),
        },
      };
    });
    expect([...(await resolveCanonicalIds(['one', 'two'], operation, { batchSize: 1 }))]).toEqual([
      ['one', 'current'],
      ['two', 'current'],
    ]);
    expect(operation).toHaveBeenCalledTimes(4);
  });

  it('fails after bounded revision churn instead of returning a split snapshot', async () => {
    let revision = 0;
    const operation: CanonicalIdentityOperation = async (ids) => ({
      kind: 'ok',
      value: { revision: revision++, data: ids.map((id) => ({ id, canonicalId: id })) },
    });
    await expect(
      resolveCanonicalIds(['one', 'two'], operation, { batchSize: 1, maxAttempts: 2 })
    ).rejects.toThrow('revision changed');
    expect(revision).toBe(4);
  });

  it.each([
    { revision: 0, data: [] },
    { revision: 0, data: [{ id: 'other', canonicalId: 'one' }] },
    { revision: 0, data: [{ id: 'one' }] },
    { revision: 0, data: [{ id: 'one', canonicalId: '' }] },
    { revision: -1, data: [{ id: 'one', canonicalId: null }] },
    null,
  ])('refuses malformed responses: %j', async (value) => {
    await expect(
      resolveCanonicalIds(['one'], async () => ({ kind: 'ok', value }))
    ).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('rejects a sparse data array as malformed rather than skipping an uncovered id', async () => {
    const data: unknown[] = [];
    data.length = 1;
    await expect(
      resolveCanonicalIds(['one'], async () => ({ kind: 'ok', value: { revision: 0, data } }))
    ).rejects.toBeInstanceOf(PillarSdkError);
  });

  it('rejects contradictory resolutions for a duplicate id at one revision', async () => {
    let call = 0;
    await expect(
      resolveCanonicalIds(
        ['one', 'one'],
        async (ids) => ({
          kind: 'ok',
          value: {
            revision: 1,
            data: ids.map((id) => ({ id, canonicalId: String(call++) })),
          },
        }),
        { batchSize: 1 }
      )
    ).rejects.toThrow('contradicts');
  });

  it.each([null, 'third'])(
    'rejects a reported canonical id that resolves elsewhere: %s',
    async (target) => {
      await expect(
        resolveCanonicalIds(['old', 'canonical'], async () => ({
          kind: 'ok',
          value: {
            revision: 1,
            data: [
              { id: 'old', canonicalId: 'canonical' },
              { id: 'canonical', canonicalId: target },
            ],
          },
        }))
      ).rejects.toThrow('fixed point');
    }
  );

  it('retains SDK failure details and propagates transport errors', async () => {
    await expect(
      resolveCanonicalIds(['one'], async () => ({ kind: 'unavailable', pillar: 'producer' }))
    ).rejects.toBeInstanceOf(PillarCallError);
    await expect(
      resolveCanonicalIds(['one'], () => Promise.reject(new Error('transport failed')))
    ).rejects.toThrow('transport failed');
  });

  it.each([0, -1, 1.5, Number.POSITIVE_INFINITY])(
    'rejects invalid batching limits %s',
    async (value) => {
      const operation = vi.fn<CanonicalIdentityOperation>();
      await expect(resolveCanonicalIds([], operation, { batchSize: value })).rejects.toBeInstanceOf(
        RangeError
      );
      await expect(
        resolveCanonicalIds([], operation, { maxAttempts: value })
      ).rejects.toBeInstanceOf(RangeError);
      expect(operation).not.toHaveBeenCalled();
    }
  );
});
