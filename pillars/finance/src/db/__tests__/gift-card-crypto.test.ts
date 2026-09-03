/**
 * Round-trip tests for the gift-card `secret_ref` crypto (POPS-2772) —
 * pure, no database involved.
 */
import { describe, expect, it } from 'vitest';

import { decryptGiftCardSecret, encryptGiftCardSecret } from '../services/gift-card-crypto.js';

describe('encryptGiftCardSecret / decryptGiftCardSecret', () => {
  it('round-trips the number and PIN through the same key', () => {
    const secretRef = encryptGiftCardSecret('correct-horse-battery-staple', {
      number: '4111111111111234',
      pin: '4321',
    });

    const decrypted = decryptGiftCardSecret('correct-horse-battery-staple', secretRef);
    expect(decrypted).toEqual({ number: '4111111111111234', pin: '4321' });
  });

  it('produces a different ciphertext for the same plaintext each time (random IV)', () => {
    const first = encryptGiftCardSecret('key-a', { number: '1234', pin: '0000' });
    const second = encryptGiftCardSecret('key-a', { number: '1234', pin: '0000' });
    expect(first).not.toBe(second);
  });

  it('fails to decrypt with a different key rather than returning garbage', () => {
    const secretRef = encryptGiftCardSecret('key-a', { number: '4111111111111234', pin: '4321' });

    expect(() => decryptGiftCardSecret('key-b', secretRef)).toThrow();
  });

  it('fails to decrypt a corrupted blob', () => {
    const secretRef = encryptGiftCardSecret('key-a', { number: '4111111111111234', pin: '4321' });
    const corrupted = secretRef.slice(0, -4) + 'AAAA';

    expect(() => decryptGiftCardSecret('key-a', corrupted)).toThrow();
  });
});
