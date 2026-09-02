import { describe, expect, it } from 'vitest';

import { DEFAULT_PORT, resolvePort, resolveSqlitePath, resolveVersion } from '../boot-env.js';

describe('resolvePort', () => {
  it('defaults to the pillar’s assigned port', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
  });

  it('reads PORT when set', () => {
    expect(resolvePort({ PORT: '4000' })).toBe(4000);
  });

  it('treats a blank PORT as unset rather than as zero', () => {
    expect(resolvePort({ PORT: '  ' })).toBe(DEFAULT_PORT);
  });

  it.each(['0', '-1', 'abc', '3015.5'])(
    'throws on %s rather than binding something else',
    (raw) => {
      expect(() => resolvePort({ PORT: raw })).toThrow(/positive integer/);
    }
  );
});

describe('resolveVersion', () => {
  it('defaults to dev', () => {
    expect(resolveVersion({})).toBe('dev');
  });

  it('reads BUILD_VERSION when set', () => {
    expect(resolveVersion({ BUILD_VERSION: '1.2.3' })).toBe('1.2.3');
  });

  it('treats a blank BUILD_VERSION as unset', () => {
    expect(resolveVersion({ BUILD_VERSION: '   ' })).toBe('dev');
  });
});

describe('resolveSqlitePath', () => {
  it('prefers the pillar’s own variable', () => {
    expect(resolveSqlitePath({ DESIGN_SQLITE_PATH: '/x/own.db', SQLITE_PATH: '/y/pops.db' })).toBe(
      '/x/own.db'
    );
  });

  it('derives design.db from the shared base path', () => {
    expect(resolveSqlitePath({ SQLITE_PATH: '/data/sqlite/pops.db' })).toBe(
      '/data/sqlite/design.db'
    );
  });

  it('falls back to a local file when neither is set', () => {
    expect(resolveSqlitePath({})).toBe('./data/design.db');
  });

  it('treats blank values as unset', () => {
    expect(resolveSqlitePath({ DESIGN_SQLITE_PATH: '  ', SQLITE_PATH: '' })).toBe(
      './data/design.db'
    );
  });
});
