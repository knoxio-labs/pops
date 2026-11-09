import { describe, expect, it } from 'vitest';

import { sourceId } from './source-id';

describe('sourceId', () => {
  it.each([
    undefined,
    '',
    '0',
    '-1',
    '+1',
    '01',
    ' 1',
    '1 ',
    '1.0',
    '1.5',
    '1e2',
    '0x10',
    'Infinity',
    'NaN',
    '9007199254740992',
    '１２',
  ])('rejects a noncanonical or unsafe identity %s', (value) => {
    expect(sourceId(value)).toBeUndefined();
  });

  it.each([
    ['1', 1],
    ['37', 37],
    ['9007199254740991', Number.MAX_SAFE_INTEGER],
  ] as const)('preserves canonical identity %s', (value, expected) => {
    expect(sourceId(value)).toBe(expected);
  });
});
