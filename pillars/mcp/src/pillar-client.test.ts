/**
 * Unit tests for the pillar-client boot guard (CF087) — which env var wins
 * as the resolved service-account key, that the choice is logged (so an
 * unexpected legacy fallback is visible in production), and that
 * configuration only runs once per process.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const configureServerSdk = vi.fn();
const pillar = vi.fn(() => ({ finance: {} }));

vi.mock('@pops/pillar-sdk/server', () => ({
  configureServerSdk: (...args: unknown[]) => configureServerSdk(...args),
  pillar: (...args: unknown[]) => pillar(...args),
}));

const { getPillar, __resetPillarClientForTests } = await import('./pillar-client.js');

const INTERNAL_KEY = 'POPS_INTERNAL_API_KEY';
const LEGACY_KEY = 'POPS_API_KEY';

beforeEach(() => {
  configureServerSdk.mockClear();
  pillar.mockClear();
  __resetPillarClientForTests();
  delete process.env[INTERNAL_KEY];
  delete process.env[LEGACY_KEY];
});

afterEach(() => {
  delete process.env[INTERNAL_KEY];
  delete process.env[LEGACY_KEY];
});

describe('getPillar — API key resolution', () => {
  it('throws when neither env var is set', () => {
    expect(() => getPillar('finance')).toThrow(/no service-account key/);
    expect(configureServerSdk).not.toHaveBeenCalled();
  });

  it('prefers POPS_INTERNAL_API_KEY over the legacy POPS_API_KEY', () => {
    process.env[INTERNAL_KEY] = 'sa_internal';
    process.env[LEGACY_KEY] = 'sa_legacy';

    getPillar('finance');

    expect(configureServerSdk).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sa_internal' })
    );
  });

  it('falls back to POPS_API_KEY when POPS_INTERNAL_API_KEY is unset', () => {
    process.env[LEGACY_KEY] = 'sa_legacy';

    getPillar('finance');

    expect(configureServerSdk).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'sa_legacy' })
    );
  });

  it('logs the resolved key source', () => {
    process.env[LEGACY_KEY] = 'sa_legacy';
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    getPillar('finance');

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('POPS_API_KEY'));
    warnSpy.mockRestore();
  });

  it('configures the SDK only once across repeated getPillar calls', () => {
    process.env[INTERNAL_KEY] = 'sa_internal';

    getPillar('finance');
    getPillar('inventory');
    getPillar('finance');

    expect(configureServerSdk).toHaveBeenCalledTimes(1);
    expect(pillar).toHaveBeenCalledTimes(3);
  });
});
