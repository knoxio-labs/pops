/**
 * Unit tests for Plex base-URL normalization, the boundary that keeps a
 * schemeless stored `plex_url` from breaking every Plex request.
 */
import { describe, expect, it } from 'vitest';

import { normalizePlexUrl } from '../url.js';

describe('normalizePlexUrl', () => {
  it('prepends http:// to a schemeless host:port', () => {
    expect(normalizePlexUrl('192.168.50.215:32400')).toBe('http://192.168.50.215:32400');
    expect(normalizePlexUrl('plex.local')).toBe('http://plex.local');
  });

  it('leaves an explicit scheme untouched', () => {
    expect(normalizePlexUrl('http://plex.local:32400')).toBe('http://plex.local:32400');
    expect(normalizePlexUrl('https://plex.local:32400')).toBe('https://plex.local:32400');
  });

  it('preserves a trailing slash for the client to strip', () => {
    expect(normalizePlexUrl('192.168.50.215:32400/')).toBe('http://192.168.50.215:32400/');
    expect(normalizePlexUrl('https://plex.local/')).toBe('https://plex.local/');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizePlexUrl('  plex.local:32400  ')).toBe('http://plex.local:32400');
  });

  it('returns null for blank, missing, and unparseable values', () => {
    expect(normalizePlexUrl(null)).toBeNull();
    expect(normalizePlexUrl(undefined)).toBeNull();
    expect(normalizePlexUrl('')).toBeNull();
    expect(normalizePlexUrl('   ')).toBeNull();
    expect(normalizePlexUrl('http://')).toBeNull();
    expect(normalizePlexUrl(':')).toBeNull();
  });
});
