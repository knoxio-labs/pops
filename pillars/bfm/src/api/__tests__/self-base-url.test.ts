import { describe, expect, it } from 'vitest';

import { parseBareOrigin, resolveSelfBaseUrl } from '../self-base-url.js';

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
