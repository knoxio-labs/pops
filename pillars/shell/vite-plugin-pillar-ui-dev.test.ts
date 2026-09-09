import { describe, expect, it } from 'vitest';

import { pillarUiDevInternals } from './vite-plugin-pillar-ui-dev.js';

const { parseUiRequest } = pillarUiDevInternals;

describe('parseUiRequest', () => {
  it('reads a pillar id and a file out of the UI path', () => {
    expect(parseUiRequest('/purchases-ui/purchases.js')).toEqual({
      pillarId: 'purchases',
      file: 'purchases.js',
    });
  });

  it('reads a hashed chunk beside the entry', () => {
    expect(parseUiRequest('/purchases-ui/MerchantLensPage-DnlaGGLo.js')).toEqual({
      pillarId: 'purchases',
      file: 'MerchantLensPage-DnlaGGLo.js',
    });
  });

  it('ignores the query string a module request may carry', () => {
    expect(parseUiRequest('/purchases-ui/purchases.js?t=123')?.file).toBe('purchases.js');
  });

  it('accepts a hyphenated pillar id', () => {
    expect(parseUiRequest('/some-pillar-ui/x.js')?.pillarId).toBe('some-pillar');
  });

  it('passes through anything that is not a UI request', () => {
    expect(parseUiRequest('/src/main.tsx')).toBeUndefined();
    expect(parseUiRequest('/purchases-api/orders')).toBeUndefined();
    expect(parseUiRequest('/purchases-ui/')).toBeUndefined();
    expect(parseUiRequest('/-ui/x.js')).toBeUndefined();
  });

  // The file segment reaches the filesystem. A traversal would serve anything
  // the dev server's user can read, which is the whole repo and then some.
  it('refuses a path that climbs out of the bundle directory', () => {
    expect(parseUiRequest('/purchases-ui/../../../../etc/passwd')).toBeUndefined();
  });

  // `req.url` arrives percent-encoded, so the check has to happen on the
  // decoded segment — otherwise this reads as an ordinary filename.
  it('refuses an encoded traversal', () => {
    expect(parseUiRequest('/purchases-ui/..%2F..%2Fetc/passwd')).toBeUndefined();
    expect(parseUiRequest('/purchases-ui/%2e%2e%2f%2e%2e%2fetc/passwd')).toBeUndefined();
  });

  it('refuses a segment that will not decode', () => {
    expect(parseUiRequest('/purchases-ui/%ZZ.js')).toBeUndefined();
  });

  it('refuses a NUL byte in the file segment', () => {
    expect(parseUiRequest('/purchases-ui/x%00.js')).toBeUndefined();
  });

  it('allows a nested file that stays inside the bundle directory', () => {
    expect(parseUiRequest('/purchases-ui/chunks/a.js')?.file).toBe('chunks/a.js');
    expect(parseUiRequest('/purchases-ui/a/../b.js')?.file).toBe('a/../b.js');
  });

  it('decodes an ordinary encoded character', () => {
    expect(parseUiRequest('/purchases-ui/a%20b.js')?.file).toBe('a b.js');
  });
});
