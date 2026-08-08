/**
 * The bare-origin rule is the SDK's single definition of what a pillar may
 * advertise as `PillarRegistryEntry.baseUrl`. Every pillar's boot path and the
 * `POPS_PILLARS` parser route through it, so this file is the only place the
 * rule is asserted.
 */
import { describe, expect, it } from 'vitest';

import { BareOriginParseError, parseBareOrigin } from '../bare-origin.js';

describe('parseBareOrigin', () => {
  it('returns a bare origin unchanged', () => {
    expect(parseBareOrigin('X', 'http://finance-api:3004')).toBe('http://finance-api:3004');
  });

  it('drops a trailing slash', () => {
    expect(parseBareOrigin('X', 'http://finance-api:3004/')).toBe('http://finance-api:3004');
  });

  it('keeps a non-default port', () => {
    expect(parseBareOrigin('X', 'https://pops.example.com:8443')).toBe(
      'https://pops.example.com:8443'
    );
  });

  it('accepts a bracketed IPv6 host', () => {
    expect(parseBareOrigin('X', 'http://[::1]:3004')).toBe('http://[::1]:3004');
  });

  it.each([
    ['a path', 'http://finance-api:3004/api'],
    ['a bare path segment', 'http://finance-api:3004/x'],
    ['a query', 'http://finance-api:3004/?a=b'],
    ['a fragment', 'http://finance-api:3004/#top'],
    ['a path and a query', 'http://finance-api:3004/api?a=b'],
  ])('rejects %s — consumers append routes to this value', (_label, raw) => {
    expect(() => parseBareOrigin('X', raw)).toThrow(/bare origin/u);
  });

  it.each([
    ['a username only', 'http://user@finance-api:3004'],
    ['a username and password', 'http://user:pass@finance-api:3004'],
    ['credentials plus a disallowed scheme', 'ftp://user:pass@finance-api:3004'],
  ])('rejects a URL carrying credentials (%s)', (_label, raw) => {
    expect(() => parseBareOrigin('X', raw)).toThrow(/credentials/u);
  });

  it('names the offending label in the credentials-rejection message', () => {
    expect(() =>
      parseBareOrigin('FINANCE_SELF_BASE_URL', 'http://user:pass@finance-api:3004')
    ).toThrow(/^FINANCE_SELF_BASE_URL "http:\/\/finance-api:3004\/"/u);
  });

  it('redacts the username and password from the thrown message, keeping the label and host', () => {
    let message = '';
    try {
      parseBareOrigin('FINANCE_SELF_BASE_URL', 'http://admin:hunter2@finance-api:3004');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('FINANCE_SELF_BASE_URL');
    expect(message).toContain('finance-api:3004');
    expect(message).not.toContain('admin');
    expect(message).not.toContain('hunter2');
  });

  it('redacts credentials even when the value fails to parse as a URL at all', () => {
    // An invalid port means `new URL` throws before username/password are
    // ever available to clear — this is the parse-failure branch, not the
    // credentials branch above, and needs its own redaction.
    let message = '';
    try {
      parseBareOrigin('FINANCE_SELF_BASE_URL', 'http://admin:hunter2@finance-api:99999');
    } catch (err) {
      message = err instanceof Error ? err.message : String(err);
    }
    expect(message).toContain('FINANCE_SELF_BASE_URL');
    expect(message).toContain('finance-api');
    expect(message).toMatch(/not a valid URL/u);
    expect(message).not.toContain('admin');
    expect(message).not.toContain('hunter2');
  });

  it.each([
    ['ftp', 'ftp://finance-api:3004'],
    ['file', 'file:///srv/finance'],
    ['ws', 'ws://finance-api:3004'],
  ])('rejects the %s scheme', (_label, raw) => {
    expect(() => parseBareOrigin('X', raw)).toThrow(/http or https/u);
  });

  // `new URL` reads this as the scheme `finance-api:` rather than host+port,
  // so a schemeless value fails on the protocol check, not on parsing.
  it('rejects a schemeless host:port', () => {
    expect(() => parseBareOrigin('X', 'finance-api:3004')).toThrow(/http or https/u);
  });

  it.each([
    ['prose', 'not a url'],
    ['an empty string', ''],
    ['whitespace', '   '],
    ['a protocol-relative URL', '//finance-api:3004'],
    ['a bare hostname', 'finance-api'],
  ])('rejects %s as not a URL at all', (_label, raw) => {
    expect(() => parseBareOrigin('X', raw)).toThrow(/not a valid URL/u);
  });

  it('throws BareOriginParseError, not a bare Error', () => {
    expect(() => parseBareOrigin('X', 'nonsense')).toThrow(BareOriginParseError);
  });

  it('leads with the label so an operator knows which value to fix', () => {
    expect(() => parseBareOrigin('FINANCE_SELF_BASE_URL', 'nonsense')).toThrow(
      /^FINANCE_SELF_BASE_URL "nonsense"/u
    );
  });

  it('quotes the rejected value so the offending suffix is visible in logs', () => {
    expect(() => parseBareOrigin('X', 'http://finance-api:3004/api')).toThrow(
      /"http:\/\/finance-api:3004\/api"/u
    );
  });

  describe('normalisations inherited from URL', () => {
    it('tolerates surrounding whitespace', () => {
      expect(parseBareOrigin('X', ' http://finance-api:3004 ')).toBe('http://finance-api:3004');
    });

    it('lowercases the scheme and host', () => {
      expect(parseBareOrigin('X', 'HTTP://FINANCE-API:3004')).toBe('http://finance-api:3004');
    });

    it('elides the default port', () => {
      expect(parseBareOrigin('X', 'http://finance-api:80')).toBe('http://finance-api');
      expect(parseBareOrigin('X', 'https://finance-api:443')).toBe('https://finance-api');
    });

    it('punycodes an IDN host', () => {
      expect(parseBareOrigin('X', 'http://ünï.example')).toBe('http://xn--n-nga1b.example');
    });
  });
});
