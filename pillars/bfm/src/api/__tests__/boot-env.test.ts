import { describe, expect, it } from 'vitest';

import {
  DEFAULT_PORT,
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

// The bare-origin rule itself is the SDK's and is asserted in
// `@pops/pillar-sdk/pillar-env`. What is bfm's — and asserted here — is that
// this pillar reads the right variable, falls back to the right port, and
// reports failures under its own process label.
describe('resolveSelfBaseUrl', () => {
  it('falls back to the loopback origin for the listening port', () => {
    expect(resolveSelfBaseUrl(3014, {})).toBe('http://localhost:3014');
  });

  it('prefers BFM_SELF_BASE_URL when set', () => {
    expect(resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014' })).toBe(
      'http://bfm-api:3014'
    );
  });

  it('normalises the origin it advertises', () => {
    expect(resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014/' })).toBe(
      'http://bfm-api:3014'
    );
  });

  it('crashes loudly rather than registering an invalid baseUrl', () => {
    expect(() => resolveSelfBaseUrl(3014, { BFM_SELF_BASE_URL: 'http://bfm-api:3014/v1' })).toThrow(
      /^\[bfm-api\] BFM_SELF_BASE_URL .* bare origin/u
    );
  });

  it('reads only its own variable', () => {
    expect(resolveSelfBaseUrl(3014, { FOOD_SELF_BASE_URL: 'http://food-api:3005' })).toBe(
      'http://localhost:3014'
    );
  });
});
