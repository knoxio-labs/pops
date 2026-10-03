import { afterEach, describe, expect, it, vi } from 'vitest';

import { memoizePricing } from '../pricing.js';

import type { LookupPricingFn } from '../types.js';

afterEach(() => vi.restoreAllMocks());

describe('memoizePricing', () => {
  it('retries a missing lookup at the one-minute TTL boundary', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const pricing = { input: 1, output: 2 };
    const lookup = vi.fn<LookupPricingFn>();
    lookup.mockResolvedValueOnce(null).mockResolvedValueOnce(pricing);
    const cachedLookup = memoizePricing(lookup);

    await expect(cachedLookup('anthropic', 'model')).resolves.toBeNull();
    now.mockReturnValue(59_999);
    await expect(cachedLookup('anthropic', 'model')).resolves.toBeNull();
    expect(lookup).toHaveBeenCalledTimes(1);

    now.mockReturnValue(60_000);
    await expect(cachedLookup('anthropic', 'model')).resolves.toEqual(pricing);
    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('keeps a priced lookup cached for the process lifetime', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const pricing = { input: 1, output: 2 };
    const lookup = vi.fn<LookupPricingFn>().mockResolvedValue(pricing);
    const cachedLookup = memoizePricing(lookup);

    await expect(cachedLookup('anthropic', 'model')).resolves.toEqual(pricing);
    now.mockReturnValue(Number.MAX_SAFE_INTEGER);
    await expect(cachedLookup('anthropic', 'model')).resolves.toEqual(pricing);

    expect(lookup).toHaveBeenCalledOnce();
  });

  it('expires a zero/zero entry as missing pricing', async () => {
    const now = vi.spyOn(Date, 'now').mockReturnValue(0);
    const pricing = { input: 1, output: 2 };
    const lookup = vi.fn<LookupPricingFn>();
    lookup.mockResolvedValueOnce({ input: 0, output: 0 }).mockResolvedValueOnce(pricing);
    const cachedLookup = memoizePricing(lookup);

    await expect(cachedLookup('anthropic', 'model')).resolves.toEqual({ input: 0, output: 0 });
    now.mockReturnValue(60_000);
    await expect(cachedLookup('anthropic', 'model')).resolves.toEqual(pricing);

    expect(lookup).toHaveBeenCalledTimes(2);
  });

  it('shares an in-flight lookup for the same provider and model', async () => {
    const pricing = { input: 1, output: 2 };
    const lookup = vi.fn<LookupPricingFn>().mockResolvedValue(pricing);
    const cachedLookup = memoizePricing(lookup);

    const first = cachedLookup('anthropic', 'model');
    const second = cachedLookup('anthropic', 'model');

    expect(lookup).toHaveBeenCalledOnce();
    await expect(Promise.all([first, second])).resolves.toEqual([pricing, pricing]);
  });
});
