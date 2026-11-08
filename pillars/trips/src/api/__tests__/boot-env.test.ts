import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PORT,
  DEFAULT_SQLITE_PATH,
  resolvePort,
  resolveSelfBaseUrl,
  resolveTripsSqlitePath,
  resolveVersion,
  shouldSelfRegister,
} from '../boot-env.js';

describe('trips boot environment', () => {
  it('resolves defaults and a valid port', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
    expect(resolvePort({ PORT: '3033' })).toBe(3033);
    expect(resolveTripsSqlitePath({})).toBe(DEFAULT_SQLITE_PATH);
  });

  it.each(['0', '-1', '65536', 'not-a-port'])('rejects invalid port %s', (PORT) => {
    expect(() => resolvePort({ PORT })).toThrow(/PORT must be a positive integer/u);
  });

  it('uses the pillar database path before the shared path', () => {
    expect(
      resolveTripsSqlitePath({
        SQLITE_PATH: '/data/shared/pops.db',
        TRIPS_SQLITE_PATH: '/data/trips/custom.db',
      })
    ).toBe('/data/trips/custom.db');
    expect(resolveTripsSqlitePath({ SQLITE_PATH: '/data/shared/pops.db' })).toBe(
      '/data/shared/trips.db'
    );
  });

  it('resolves the registry origin and registration flag', () => {
    expect(resolveSelfBaseUrl(3018, {})).toBe('http://localhost:3018');
    expect(resolveSelfBaseUrl(3018, { TRIPS_SELF_BASE_URL: 'http://trips-api:3018' })).toBe(
      'http://trips-api:3018'
    );
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'true' })).toBe(true);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'TRUE' })).toBe(false);
    expect(resolveVersion({})).toBe('dev');
  });
});
