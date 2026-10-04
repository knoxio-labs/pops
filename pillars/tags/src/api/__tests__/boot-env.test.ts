import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PORT,
  DEFAULT_SQLITE_PATH,
  resolvePort,
  resolveSelfBaseUrl,
  resolveTagsSqlitePath,
  resolveVersion,
  shouldSelfRegister,
} from '../boot-env.js';

describe('tags boot environment', () => {
  it('resolves defaults and a valid port', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
    expect(resolvePort({ PORT: '3033' })).toBe(3033);
    expect(resolveTagsSqlitePath({})).toBe(DEFAULT_SQLITE_PATH);
  });

  it.each(['0', '-1', '65536', 'not-a-port'])('rejects invalid port %s', (PORT) => {
    expect(() => resolvePort({ PORT })).toThrow(/PORT must be a positive integer/u);
  });

  it('uses the pillar database path before the shared path', () => {
    expect(
      resolveTagsSqlitePath({
        SQLITE_PATH: '/data/shared/pops.db',
        TAGS_SQLITE_PATH: '/data/tags/custom.db',
      })
    ).toBe('/data/tags/custom.db');
    expect(resolveTagsSqlitePath({ SQLITE_PATH: '/data/shared/pops.db' })).toBe(
      '/data/shared/tags.db'
    );
  });

  it('resolves the registry origin and registration flag', () => {
    expect(resolveSelfBaseUrl(3017, {})).toBe('http://localhost:3017');
    expect(resolveSelfBaseUrl(3017, { TAGS_SELF_BASE_URL: 'http://tags-api:3017' })).toBe(
      'http://tags-api:3017'
    );
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'true' })).toBe(true);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'TRUE' })).toBe(false);
    expect(resolveVersion({})).toBe('dev');
  });
});
