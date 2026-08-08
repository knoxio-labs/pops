/**
 * The cursor codec on its own.
 *
 * `mobile-transactions.test.ts` proves the paging behaviour; what is under
 * test here is the narrower promise the codec makes — that anything this
 * pillar did not mint decodes to `null` rather than to a plausible anchor.
 * A cursor that decoded to a wrong-but-valid position would page past rows in
 * total silence, which is the exact failure cursors exist to prevent.
 */
import { describe, expect, it } from 'vitest';

import { decodePageCursor, encodePageCursor } from '../cursor.js';

describe('round trip', () => {
  it('returns the anchor it was given', () => {
    const anchor = { d: '2026-03-05', i: 'txn-1' };

    expect(decodePageCursor(encodePageCursor(anchor))).toEqual(anchor);
  });

  it('survives an id that needs escaping in a URL', () => {
    const anchor = { d: '2026-03-05', i: 'txn/1+2=3 &four' };

    expect(decodePageCursor(encodePageCursor(anchor))).toEqual(anchor);
  });

  it('encodes url-safe, so a cursor never needs quoting in a query string', () => {
    const encoded = encodePageCursor({ d: '2026-03-05', i: 'txn-1' });

    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/u);
    expect(encodeURIComponent(encoded)).toBe(encoded);
  });
});

describe('anything this pillar did not mint', () => {
  const rejected: readonly [string, string][] = [
    ['not base64 at all', 'not-a-cursor!!'],
    ['base64 of something that is not JSON', Buffer.from('nonsense', 'utf8').toString('base64url')],
    ['base64 of JSON that is not an object', Buffer.from('42', 'utf8').toString('base64url')],
    ['an empty string', ''],
  ];

  it.each(rejected)('rejects %s', (_label, encoded) => {
    expect(decodePageCursor(encoded)).toBeNull();
  });

  it('rejects an anchor missing its id half, rather than paging on a date alone', () => {
    const halfAnchor = Buffer.from(JSON.stringify({ d: '2026-03-05' }), 'utf8').toString(
      'base64url'
    );

    expect(decodePageCursor(halfAnchor)).toBeNull();
  });

  it('rejects an empty id, which would compare as before every row', () => {
    const emptyId = Buffer.from(JSON.stringify({ d: '2026-03-05', i: '' }), 'utf8').toString(
      'base64url'
    );

    expect(decodePageCursor(emptyId)).toBeNull();
  });

  it('rejects a non-string anchor half rather than coercing it', () => {
    const numericId = Buffer.from(JSON.stringify({ d: '2026-03-05', i: 7 }), 'utf8').toString(
      'base64url'
    );

    expect(decodePageCursor(numericId)).toBeNull();
  });
});

describe('opacity', () => {
  it('is encoding and not secrecy — nothing may be put in one that matters if read', () => {
    // Asserted so nobody later mistakes the base64 for protection and puts a
    // device id, a token or a user identifier in the anchor.
    const encoded = encodePageCursor({ d: '2026-03-05', i: 'txn-1' });

    expect(Buffer.from(encoded, 'base64url').toString('utf8')).toContain('txn-1');
  });
});
