import { describe, expect, it } from 'vitest';

import { bookingFingerprint, bookingTextOriginal } from '../services/booking-import-original.js';

describe('Booking stored-string representation encoding', () => {
  it.each([
    ['\uD800', '\uFFFD'],
    ['\u00E9', 'e\u0301'],
    ['first\r\nsecond', 'first\nsecond'],
    ['source', ' source '],
  ])('keeps distinct strings distinct without normalizing %j and %j', (first, second) => {
    const firstOriginal = bookingTextOriginal(first);
    const secondOriginal = bookingTextOriginal(second);
    expect(firstOriginal.text).toBe(first);
    expect(secondOriginal.text).toBe(second);
    expect(bookingFingerprint(firstOriginal).sha256).not.toBe(
      bookingFingerprint(secondOriginal).sha256
    );
  });
});
