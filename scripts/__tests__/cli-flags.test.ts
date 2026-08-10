import { describe, expect, it } from 'vitest';

import { readFlag } from '../cli-flags.mjs';

describe('readFlag', () => {
  it('reads the value after the flag', () => {
    expect(readFlag(['--assess', 'a.json'], '--assess')).toBe('a.json');
  });

  it('does not swallow the next flag as a value', () => {
    expect(readFlag(['--assess', '--json'], '--assess')).toBeUndefined();
    expect(readFlag(['--assess'], '--assess')).toBeUndefined();
    expect(readFlag([], '--assess')).toBeUndefined();
  });
});
