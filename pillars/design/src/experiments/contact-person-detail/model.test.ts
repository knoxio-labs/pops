import { describe, expect, it } from 'vitest';

import { initialPerson, overlap, visitName } from './model';

const visit = { city: 'Berlin', start: '2027-06-12', end: '2027-06-17' };
describe('person visit context', () => {
  it('includes a shared boundary day', () => {
    expect(overlap(visit, { ...visit, start: '2027-06-17', end: '2027-06-20' })).toBe(
      '2027-06-17 → 2027-06-17'
    );
  });
  it.each([
    { ...visit, city: 'Amsterdam' },
    { ...visit, start: '' },
    { ...visit, start: '2027-06-18' },
    { ...visit, start: '2027-06-20', end: '2027-06-19' },
    { ...visit, start: '2027-02-30' },
  ])('does not fabricate overlap for disjoint, incomplete or invalid bounds', (other) => {
    expect(overlap(visit, other)).toBeNull();
  });
  it('uses readable reference fallbacks', () => {
    expect(visitName('removed')).toBe('Visit unavailable');
    expect(visitName('')).toBe('Choose visit');
    expect(visitName('family')).toContain('Porto Alegre');
  });
  it('isolates snapshots and preserves conflicting facts', () => {
    const person = initialPerson('default');
    person.methods.splice(0);
    expect(initialPerson('default').methods).toHaveLength(4);
    expect(initialPerson('conflicting').availability.map((entry) => entry.status)).toEqual([
      'Available',
      'Unavailable',
    ]);
    expect(initialPerson('new').methods).toEqual([]);
  });
});
