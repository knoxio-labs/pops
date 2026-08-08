/**
 * The federation half of boot validation.
 *
 * Every case here is a value that would otherwise start the process and then
 * fail every outbound call as an indistinguishable `unavailable` — the failure
 * mode these parsers exist to convert into a crash with a variable name in it.
 */
import { describe, expect, it } from 'vitest';

import { BootEnvError } from '../../boot-env.js';
import { DEFAULT_REGISTRY_URL, parseInternalBaseUrls, resolveRegistryUrl } from '../env.js';

describe('resolveRegistryUrl', () => {
  it('falls back to the in-cluster registry host when unset', () => {
    expect(resolveRegistryUrl({})).toBe(DEFAULT_REGISTRY_URL);
  });

  it('treats a blank value as unset, not as an empty override', () => {
    // A Compose interpolation that resolved to nothing leaves `VAR=` behind.
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
    expect(() => resolveRegistryUrl({ POPS_REGISTRY_URL: value })).toThrow(BootEnvError);
  });
});

describe('parseInternalBaseUrls', () => {
  it('reads absence as no overrides', () => {
    expect(parseInternalBaseUrls(undefined)).toBeUndefined();
    expect(parseInternalBaseUrls('')).toBeUndefined();
    expect(parseInternalBaseUrls('  ')).toBeUndefined();
  });

  it('parses a single entry', () => {
    expect(parseInternalBaseUrls('finance:http://localhost:3004')).toEqual({
      finance: 'http://localhost:3004',
    });
  });

  it('parses several, tolerating whitespace around the separators', () => {
    expect(
      parseInternalBaseUrls(' finance : http://localhost:3004 , lists:http://localhost:3006')
    ).toEqual({
      finance: 'http://localhost:3004',
      lists: 'http://localhost:3006',
    });
  });

  it('keeps the colons inside the URL out of the id split', () => {
    expect(parseInternalBaseUrls('finance:https://finance.example.com:8443')).toEqual({
      finance: 'https://finance.example.com:8443',
    });
  });

  it.each([
    ['a missing colon', 'finance'],
    ['a stray comma', 'finance:http://localhost:3004,'],
    ['an empty id', ':http://localhost:3004'],
    ['a non-kebab id', 'Finance:http://localhost:3004'],
    ['an id that could pollute the prototype', '__proto__:http://localhost:3004'],
    ['a missing base URL', 'finance:'],
    ['a base URL carrying a path', 'finance:http://localhost:3004/api'],
  ])('rejects %s', (_label, value) => {
    expect(() => parseInternalBaseUrls(value)).toThrow(BootEnvError);
  });

  it('rejects a duplicate id rather than letting the last one win silently', () => {
    expect(() =>
      parseInternalBaseUrls('finance:http://localhost:3004,finance:http://localhost:9999')
    ).toThrow(BootEnvError);
  });
});
