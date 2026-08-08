/**
 * The federation half of boot validation.
 *
 * The parsing itself belongs to `@pops/pillar-sdk/pillar-env` and is tested
 * there; what is asserted here is bfm's use of it — which variable feeds
 * which knob, what absence means, and that a malformed value crashes rather
 * than starting a process that would report every outbound call as an
 * indistinguishable `unavailable`.
 */
import { describe, expect, it } from 'vitest';

import { BareOriginParseError } from '@pops/pillar-sdk/pillar-env';

import { BootEnvError } from '../../boot-env.js';
import { DEFAULT_REGISTRY_URL, resolveInternalBaseUrls, resolveRegistryUrl } from '../env.js';

describe('resolveRegistryUrl', () => {
  it('falls back to the in-cluster registry host when unset', () => {
    expect(resolveRegistryUrl({})).toBe(DEFAULT_REGISTRY_URL);
  });

  it('treats a blank value as unset, not as an empty override', () => {
    expect(resolveRegistryUrl({ POPS_REGISTRY_URL: '   ' })).toBe(DEFAULT_REGISTRY_URL);
  });

  it('normalises a valid origin', () => {
    expect(resolveRegistryUrl({ POPS_REGISTRY_URL: 'http://registry-api:3001/' })).toBe(
      'http://registry-api:3001'
    );
  });

  it.each([
    ['not a url', 'registry-api:3001'],
    ['a non-http scheme', 'ftp://registry-api:3001'],
    ['a path', 'http://registry-api:3001/registry'],
    ['a query', 'http://registry-api:3001?a=1'],
  ])('rejects %s', (_label, value) => {
    expect(() => resolveRegistryUrl({ POPS_REGISTRY_URL: value })).toThrow(BareOriginParseError);
  });

  it('names the variable in the error, since that is the whole point of crashing', () => {
    expect(() => resolveRegistryUrl({ POPS_REGISTRY_URL: 'nope' })).toThrow(/POPS_REGISTRY_URL/);
  });
});

describe('resolveInternalBaseUrls', () => {
  it('reads absence as no overrides rather than an empty map', () => {
    // `undefined` and `{}` mean the same thing to the SDK, but only one of
    // them leaves the config field off entirely.
    expect(resolveInternalBaseUrls({})).toBeUndefined();
    expect(resolveInternalBaseUrls({ POPS_INTERNAL_BASE_URLS: '  ' })).toBeUndefined();
  });

  it('shapes the entries into the id → baseUrl map configureServerSdk wants', () => {
    expect(
      resolveInternalBaseUrls({
        POPS_INTERNAL_BASE_URLS: 'finance:http://localhost:3004, lists:http://localhost:3006',
      })
    ).toEqual({
      finance: 'http://localhost:3004',
      lists: 'http://localhost:3006',
    });
  });

  it('keeps the colons inside the URL out of the id split', () => {
    expect(
      resolveInternalBaseUrls({
        POPS_INTERNAL_BASE_URLS: 'finance:https://finance.example.com:8443',
      })
    ).toEqual({ finance: 'https://finance.example.com:8443' });
  });

  /**
   * `POPS_PILLARS` carries the same shape fleet-wide and a different meaning:
   * production stopped plumbing it once the registry became the source of
   * truth, while dev compose still sets a static roster on every service.
   * Honouring it here would bypass discovery in dev and nowhere else.
   */
  it('ignores POPS_PILLARS, which shares the shape but not the meaning', () => {
    expect(
      resolveInternalBaseUrls({ POPS_PILLARS: 'finance:http://finance-api:3004' })
    ).toBeUndefined();
  });

  it.each([
    ['a missing colon', 'finance'],
    ['a stray comma', 'finance:http://localhost:3004,'],
    ['a duplicate id', 'finance:http://localhost:3004,finance:http://localhost:9999'],
    ['a base URL carrying a path', 'finance:http://localhost:3004/api'],
  ])('rejects %s rather than dropping the entry', (_label, value) => {
    expect(() => resolveInternalBaseUrls({ POPS_INTERNAL_BASE_URLS: value })).toThrow(BootEnvError);
  });

  it('names the variable it actually read, not the one the SDK parser labels', () => {
    // The SDK's PillarsEnvParseError says "POPS_PILLARS:"; an operator sent to
    // fix that variable would change nothing and conclude the error is a lie.
    expect(() => resolveInternalBaseUrls({ POPS_INTERNAL_BASE_URLS: 'finance' })).toThrow(
      /POPS_INTERNAL_BASE_URLS/
    );
  });

  it('keeps the parser complaint reachable as the cause', () => {
    try {
      resolveInternalBaseUrls({ POPS_INTERNAL_BASE_URLS: 'finance' });
      throw new Error('expected a throw');
    } catch (error) {
      expect(error).toBeInstanceOf(BootEnvError);
      expect((error as BootEnvError).cause).toBeInstanceOf(Error);
      expect(String((error as { cause?: Error }).cause?.message)).toContain('missing a colon');
    }
  });
});
