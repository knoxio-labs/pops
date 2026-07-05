/**
 * Unit tests for the pillar-client boot guard (CF087) — which env var wins
 * as the resolved service-account key, that the choice is logged (so an
 * unexpected legacy fallback is visible in production), and that
 * configuration only runs once per process — plus base-URL resolution,
 * which must stay registry-driven with no hardcoded per-pillar defaults.
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

describe('getPillar — base-URL resolution', () => {
  const BASE_URL_ENV_KEYS = [
    'POPS_INVENTORY_API_URL',
    'POPS_FINANCE_API_URL',
    'POPS_REGISTRY_API_URL',
    'POPS_MEDIA_API_URL',
    'POPS_CEREBRUM_API_URL',
    'POPS_CONTACTS_API_URL',
  ] as const;

  beforeEach(() => {
    process.env[INTERNAL_KEY] = 'sa_internal';
    for (const key of BASE_URL_ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of BASE_URL_ENV_KEYS) delete process.env[key];
  });

  it('does not install a hardcoded override map when no POPS_*_API_URL env vars are set', () => {
    getPillar('inventory');

    expect(configureServerSdk).toHaveBeenCalledWith(
      expect.not.objectContaining({ internalBaseUrls: expect.anything() })
    );
  });

  it('only overrides a pillar whose POPS_<PILLAR>_API_URL env var is explicitly set', () => {
    process.env['POPS_INVENTORY_API_URL'] = 'http://localhost:4102';

    getPillar('inventory');

    expect(configureServerSdk).toHaveBeenCalledWith(
      expect.objectContaining({ internalBaseUrls: { inventory: 'http://localhost:4102' } })
    );
  });

  it('resolves every configured pillar env var into its own override entry', () => {
    process.env['POPS_INVENTORY_API_URL'] = 'http://localhost:4102';
    process.env['POPS_MEDIA_API_URL'] = 'http://localhost:4103';

    getPillar('inventory');

    expect(configureServerSdk).toHaveBeenCalledWith(
      expect.objectContaining({
        internalBaseUrls: {
          inventory: 'http://localhost:4102',
          media: 'http://localhost:4103',
        },
      })
    );
  });
});
