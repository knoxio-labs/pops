import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PORT,
  parseBareOrigin,
  resolvePort,
  resolveSelfBaseUrl,
  resolveVersion,
  shouldSelfRegister,
} from '../boot-env.js';

describe('resolvePort', () => {
  it('defaults to the pillar port when PORT is absent or empty', () => {
    expect(resolvePort({})).toBe(DEFAULT_PORT);
    expect(resolvePort({ PORT: '' })).toBe(DEFAULT_PORT);
    expect(DEFAULT_PORT).toBe(3014);
  });

  it('accepts a valid port', () => {
    expect(resolvePort({ PORT: '8080' })).toBe(8080);
  });

  it.each([
    ['non-numeric', 'notanumber'],
    ['fractional', '3014.5'],
    ['zero', '0'],
    ['negative', '-1'],
    ['above the 16-bit range', '65536'],
    ['whitespace, which Number coerces to 0', ' '],
  ])('rejects a %s PORT rather than binding something unintended', (_label, raw) => {
    expect(() => resolvePort({ PORT: raw })).toThrow(/PORT must be a positive integer/u);
  });

  it('accepts the boundary ports', () => {
    expect(resolvePort({ PORT: '1' })).toBe(1);
    expect(resolvePort({ PORT: '65535' })).toBe(65535);
  });
});

describe('shouldSelfRegister', () => {
  it('is off unless POPS_REGISTRY_ENABLED is exactly "true"', () => {
    expect(shouldSelfRegister({})).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: '' })).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'false' })).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: '1' })).toBe(false);
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'TRUE' })).toBe(false);
  });

  it('is on for the exact opt-in string', () => {
    expect(shouldSelfRegister({ POPS_REGISTRY_ENABLED: 'true' })).toBe(true);
  });
});

describe('resolveVersion', () => {
  it('defaults to dev', () => {
    expect(resolveVersion({})).toBe('dev');
    expect(resolveVersion({ BUILD_VERSION: '' })).toBe('dev');
  });

  it('passes a build identifier through verbatim, semver or not', () => {
    expect(resolveVersion({ BUILD_VERSION: '1.2.3' })).toBe('1.2.3');
    expect(resolveVersion({ BUILD_VERSION: 'abc1234' })).toBe('abc1234');
  });
});

describe('parseBareOrigin', () => {
  it('normalises a bare origin, dropping the trailing slash', () => {
    expect(parseBareOrigin('X', 'http://bfm-api:3014/')).toBe('http://bfm-api:3014');
  });

  it('keeps a non-default port', () => {
    expect(parseBareOrigin('X', 'https://bfm.example.com:8443')).toBe(
      'https://bfm.example.com:8443'
    );
  });

  it.each([
    ['a path', 'http://bfm-api:3014/api'],
    ['a query', 'http://bfm-api:3014/?x=1'],
    ['a fragment', 'http://bfm-api:3014/#top'],
  ])('rejects %s — consumers append routes to this value', (_label, raw) => {
    expect(() => parseBareOrigin('X', raw)).toThrow(/bare origin/u);
  });

  it('rejects a non-http scheme', () => {
    expect(() => parseBareOrigin('X', 'ftp://bfm-api:3014')).toThrow(/http or https/u);
  });

  // `new URL` reads this as the scheme `bfm-api:` rather than host+port, so a
  // schemeless value fails on the protocol check, not on parsing.
  it('rejects a schemeless host:port', () => {
    expect(() => parseBareOrigin('X', 'bfm-api:3014')).toThrow(/http or https/u);
  });

  it('rejects a value that is not a URL at all', () => {
    expect(() => parseBareOrigin('X', 'not a url')).toThrow(/not a valid URL/u);
  });

  it('names the offending variable so an operator knows what to fix', () => {
    expect(() => parseBareOrigin('BFM_SELF_BASE_URL', 'nonsense')).toThrow(/BFM_SELF_BASE_URL/u);
  });
});

describe('resolveSelfBaseUrl', () => {
  it('falls back to the loopback origin for the listening port', () => {
    expect(resolveSelfBaseUrl(3014, {})).toBe('http://localhost:3014');
  });

  it('prefers BFM_SELF_BASE_URL when set', () => {
    expect(resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014' })).toBe(
      'http://bfm-api:3014'
    );
  });

  it('crashes loudly rather than registering an invalid baseUrl', () => {
    expect(() => resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014/v1' })).toThrow(
      /\[bfm-api\].*bare origin/u
    );
  });
});
