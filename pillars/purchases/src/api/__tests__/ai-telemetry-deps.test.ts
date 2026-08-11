/**
 * `httpLookupPricing` is the network boundary (it fetches the ai pillar) and
 * is the only mock; `memoizePricing` and the process-level cache run for
 * real, so these assert exactly what the production wiring does: which URL
 * it points at, that repeat calls reuse one deps object, and that a pricing
 * lookup for a given (provider, model) hits the pillar at most once.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const httpLookupPricingMock = vi.hoisted(() => vi.fn());
vi.mock('@pops/ai-telemetry', () => ({
  httpLookupPricing: httpLookupPricingMock,
}));

const URL_VAR = 'AI_API_URL';

beforeEach(() => {
  vi.resetModules();
  httpLookupPricingMock.mockReset();
  delete process.env[URL_VAR];
});

describe('purchasesTelemetryDeps', () => {
  it('points httpLookupPricing at the default ai-api URL when AI_API_URL is unset', async () => {
    httpLookupPricingMock.mockReturnValue(vi.fn());
    const { purchasesTelemetryDeps } = await import('../ai-telemetry-deps.js');
    purchasesTelemetryDeps();
    expect(httpLookupPricingMock).toHaveBeenCalledWith('http://ai-api:3008');
  });

  it('honours AI_API_URL when set', async () => {
    process.env[URL_VAR] = 'http://ai-api-custom:4000';
    httpLookupPricingMock.mockReturnValue(vi.fn());
    const { purchasesTelemetryDeps } = await import('../ai-telemetry-deps.js');
    purchasesTelemetryDeps();
    expect(httpLookupPricingMock).toHaveBeenCalledWith('http://ai-api-custom:4000');
  });

  it('caches one deps object per process rather than rebuilding it', async () => {
    httpLookupPricingMock.mockReturnValue(vi.fn());
    const { purchasesTelemetryDeps } = await import('../ai-telemetry-deps.js');
    expect(purchasesTelemetryDeps()).toBe(purchasesTelemetryDeps());
    expect(httpLookupPricingMock).toHaveBeenCalledTimes(1);
  });

  it('memoizes a pricing hit by provider+model, so a repeat lookup does not re-hit the pillar', async () => {
    const underlying = vi.fn(async () => ({ input: 1, output: 2 }));
    httpLookupPricingMock.mockReturnValue(underlying);
    const { purchasesTelemetryDeps } = await import('../ai-telemetry-deps.js');
    const deps = purchasesTelemetryDeps();

    await deps.lookupPricing('anthropic', 'claude-sonnet-5');
    await deps.lookupPricing('anthropic', 'claude-sonnet-5');
    await deps.lookupPricing('anthropic', 'claude-haiku-4-5');

    expect(underlying).toHaveBeenCalledTimes(2);
  });

  it('memoizes a pricing miss too, so an unpriced model does not re-hit the pillar', async () => {
    const underlying = vi.fn(async () => null);
    httpLookupPricingMock.mockReturnValue(underlying);
    const { purchasesTelemetryDeps } = await import('../ai-telemetry-deps.js');
    const deps = purchasesTelemetryDeps();

    await deps.lookupPricing('anthropic', 'unpriced-model');
    await deps.lookupPricing('anthropic', 'unpriced-model');

    expect(underlying).toHaveBeenCalledTimes(1);
  });
});

describe('__setPurchasesTelemetryDepsForTests', () => {
  it('overrides the deps purchasesTelemetryDeps returns, and null restores the real ones', async () => {
    const underlying = vi.fn();
    httpLookupPricingMock.mockReturnValue(underlying);
    const { purchasesTelemetryDeps, __setPurchasesTelemetryDepsForTests } =
      await import('../ai-telemetry-deps.js');

    const fake = { lookupPricing: vi.fn(async () => null) };
    __setPurchasesTelemetryDepsForTests(fake);
    expect(purchasesTelemetryDeps()).toBe(fake);

    __setPurchasesTelemetryDepsForTests(null);
    expect(purchasesTelemetryDeps()).not.toBe(fake);
  });
});
