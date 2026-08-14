import { describe, expect, it } from 'vitest';

import { isRecord, sortJson } from '../json.js';

describe('isRecord', () => {
  it('rejects the three things that are typeof object but not a keyed record', () => {
    expect(isRecord(null)).toBe(false);
    expect(isRecord([])).toBe(false);
    expect(isRecord(undefined)).toBe(false);
  });

  it('accepts a plain object', () => {
    expect(isRecord({ a: 1 })).toBe(true);
  });
});

describe('sortJson', () => {
  it('sorts keys at every depth', () => {
    const sorted = sortJson({ b: 1, a: { d: 2, c: 3 } });
    expect(JSON.stringify(sorted)).toBe('{"a":{"c":3,"d":2},"b":1}');
  });

  it('sorts inside arrays without reordering the array itself', () => {
    const sorted = sortJson([{ b: 1, a: 2 }, 'z', 'a']);
    expect(JSON.stringify(sorted)).toBe('[{"a":2,"b":1},"z","a"]');
  });

  it('sorts by code unit, not by locale — `toSorted` default, which the snapshots encode', () => {
    const sorted = sortJson({ a: 1, B: 2, A: 3, b: 4 });
    expect(Object.keys(sorted as Record<string, unknown>)).toEqual(['A', 'B', 'a', 'b']);
  });

  it('passes primitives and null through untouched', () => {
    expect(sortJson(null)).toBeNull();
    expect(sortJson(7)).toBe(7);
    expect(sortJson('x')).toBe('x');
    expect(sortJson(false)).toBe(false);
  });

  it('does not mutate its input', () => {
    const input = { b: 1, a: 2 };
    sortJson(input);
    expect(Object.keys(input)).toEqual(['b', 'a']);
  });

  it('is stable: sorting an already-sorted document is a no-op', () => {
    const once = sortJson({ z: { y: 1, a: 2 }, a: [3, { c: 1, b: 2 }] });
    expect(JSON.stringify(sortJson(once))).toBe(JSON.stringify(once));
  });
});
