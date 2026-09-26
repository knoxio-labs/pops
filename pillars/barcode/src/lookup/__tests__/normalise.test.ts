import { describe, expect, it } from 'vitest';

import { InvalidBarcodeError, normaliseBarcode } from '../normalise.js';

describe('normaliseBarcode', () => {
  it('converts ISBN-10 to ISBN-13', () => {
    expect(normaliseBarcode('857542161-1')).toEqual({
      code: '9788575421611',
      kind: 'book',
    });
  });

  it('strips ISBN-13 separators', () => {
    expect(normaliseBarcode('978-0-330-42330-4')).toEqual({
      code: '9780330423304',
      kind: 'book',
    });
  });

  it('accepts an ISBN-10 with an X check digit', () => {
    expect(normaliseBarcode('0-8044-2957-X')).toEqual({
      code: '9780804429573',
      kind: 'book',
    });
  });

  it.each(['9780330423305', '978033042330A', '12345678901'])('rejects %s', (input) => {
    expect(() => normaliseBarcode(input)).toThrow(InvalidBarcodeError);
  });

  it('classifies a valid 977 EAN-13 as outside the books route', () => {
    expect(normaliseBarcode('9771234567898')).toEqual({
      code: '9771234567898',
      kind: 'unsupported',
    });
  });
});
