import { describe, expect, it } from 'vitest';

import { encodeFile, encodeText } from '../encode';

describe('encodeText', () => {
  it('base64-encodes the UTF-8 bytes, not the code units', () => {
    // 'é' is two bytes in UTF-8. A latin1 encoding would produce 'Y2Fm6Q=='
    // and the server would store a receipt body nobody typed.
    expect(encodeText('café')).toBe('Y2Fmw6k=');
  });

  it('encodes an emoji outside the basic plane', () => {
    expect(encodeText('🧾')).toBe('8J+nvg==');
  });

  it('pads the way base64 requires', () => {
    expect(encodeText('a')).toBe('YQ==');
    expect(encodeText('ab')).toBe('YWI=');
    expect(encodeText('abc')).toBe('YWJj');
  });
});

describe('encodeFile', () => {
  it('produces bare base64 — the contract rejects a data-URI prefix', async () => {
    const encoded = await encodeFile(new Blob(['receipt bytes'], { type: 'text/plain' }));

    expect(encoded).not.toMatch(/^data:/);
    expect(encoded).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);
    expect(atob(encoded)).toBe('receipt bytes');
  });

  it('encodes a whole photograph rather than blowing the call stack on it', async () => {
    // Larger than the 0x8000-byte chunk the encoder spreads at a time: a
    // single spread of a phone photograph's bytes overflows the stack.
    const bytes = new Uint8Array(200_000);
    for (let index = 0; index < bytes.length; index += 1) bytes[index] = index % 256;

    const decoded = atob(await encodeFile(new Blob([bytes])));

    expect(decoded).toHaveLength(bytes.length);
    expect(decoded.charCodeAt(0)).toBe(0);
    expect(decoded.charCodeAt(255)).toBe(255);
    expect(decoded.charCodeAt(0x8000)).toBe(0x8000 % 256);
    expect(decoded.charCodeAt(bytes.length - 1)).toBe((bytes.length - 1) % 256);
  });

  it('encodes an empty file as an empty string rather than failing', async () => {
    expect(await encodeFile(new Blob([]))).toBe('');
  });
});
