import { describe, expect, it } from 'vitest';

import { fieldValueSchema } from '../values.js';

describe('fieldValueSchema', () => {
  it('accepts a non-empty string for a text field', () => {
    const schema = fieldValueSchema({ kind: 'text' });
    expect(schema.safeParse('a footprint').success).toBe(true);
  });

  it('rejects an empty string for a text field', () => {
    const schema = fieldValueSchema({ kind: 'text' });
    expect(schema.safeParse('').success).toBe(false);
  });

  it('accepts a boolean for a flag field and rejects anything else', () => {
    const schema = fieldValueSchema({ kind: 'flag' });
    expect(schema.safeParse(true).success).toBe(true);
    expect(schema.safeParse('true').success).toBe(false);
  });

  it('accepts a value from the declared choice list', () => {
    const schema = fieldValueSchema({ kind: 'choice', choices: ['E27', 'GU10', 'B22'] });
    expect(schema.safeParse('GU10').success).toBe(true);
  });

  it('rejects a value outside the declared choice list', () => {
    const schema = fieldValueSchema({ kind: 'choice', choices: ['E27', 'GU10', 'B22'] });
    expect(schema.safeParse('E14').success).toBe(false);
  });

  it('throws when a choice field has no choices', () => {
    expect(() => fieldValueSchema({ kind: 'choice' })).toThrow(/non-empty/);
  });

  it('accepts a measurement typed in a unit belonging to its dimension', () => {
    const schema = fieldValueSchema({ kind: 'measurement', dimension: 'length' });
    expect(schema.safeParse({ value: 1.5, unit: 'm' }).success).toBe(true);
  });

  it('rejects a measurement typed in a unit of the wrong dimension', () => {
    const schema = fieldValueSchema({ kind: 'measurement', dimension: 'length' });
    expect(schema.safeParse({ value: 1.5, unit: 'kg' }).success).toBe(false);
  });

  it('throws when a measurement field has no dimension', () => {
    expect(() => fieldValueSchema({ kind: 'measurement' })).toThrow(/dimension/);
  });

  it('accepts a range whose low does not exceed its high', () => {
    const schema = fieldValueSchema({ kind: 'range', dimension: 'colour-temperature' });
    expect(schema.safeParse({ low: 2700, high: 6500, unit: 'K' }).success).toBe(true);
  });

  it('rejects a range whose low is above its high', () => {
    const schema = fieldValueSchema({ kind: 'range', dimension: 'colour-temperature' });
    expect(schema.safeParse({ low: 6500, high: 2700, unit: 'K' }).success).toBe(false);
  });

  it('accepts a range whose low equals its high', () => {
    const schema = fieldValueSchema({ kind: 'range', dimension: 'colour-temperature' });
    expect(schema.safeParse({ low: 4000, high: 4000, unit: 'K' }).success).toBe(true);
  });

  it('rejects a range typed in a unit of the wrong dimension', () => {
    const schema = fieldValueSchema({ kind: 'range', dimension: 'colour-temperature' });
    expect(schema.safeParse({ low: 1, high: 2, unit: 'm' }).success).toBe(false);
  });

  it('accepts an absolute URL for a link field', () => {
    const schema = fieldValueSchema({ kind: 'link' });
    expect(schema.safeParse('https://example.com/manual.pdf').success).toBe(true);
  });

  it('rejects a non-URL string for a link field', () => {
    const schema = fieldValueSchema({ kind: 'link' });
    expect(schema.safeParse('not a url').success).toBe(false);
  });
});
