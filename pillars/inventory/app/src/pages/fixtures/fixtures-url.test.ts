import { describe, expect, it } from 'vitest';

import { parseFixturesUrl, writeFixturesUrl } from './fixtures-url.js';

describe('fixture URL state', () => {
  it('keeps unrelated query parameters and rejects unknown kinds', () => {
    const params = new URLSearchParams('q=outlet&kind=power&tab=fixtures');

    expect(parseFixturesUrl(params)).toEqual({ q: 'outlet', kind: 'power' });
    expect(writeFixturesUrl(params, { q: 'desk', kind: null }).toString()).toBe(
      'q=desk&tab=fixtures'
    );
    expect(parseFixturesUrl(new URLSearchParams('kind=unknown'))).toEqual({ q: '', kind: null });
  });

  it('removes blank filters rather than leaving empty URL keys', () => {
    const params = writeFixturesUrl(new URLSearchParams('q=old&kind=light'), {
      q: '   ',
      kind: null,
    });

    expect(params.toString()).toBe('');
  });
});
