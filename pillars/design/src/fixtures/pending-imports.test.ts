import { pendingImportById, pendingSets, sourceLabel } from '@/fixtures/pending-imports';
import { describe, expect, it } from 'vitest';

describe('sourceLabel', () => {
  it('names a live feed by its provider', () => {
    expect(sourceLabel({ kind: 'live', provider: 'Up' })).toBe('Up live feed');
  });

  it('names a file import by its file, counting the rest', () => {
    expect(sourceLabel({ kind: 'file', format: 'Amex', files: ['a.csv'] })).toBe('a.csv');
    expect(sourceLabel({ kind: 'file', format: 'Amex', files: ['a.csv', 'b.csv', 'c.csv'] })).toBe(
      'a.csv and 2 more'
    );
  });

  it('falls back to the format when no file was recorded', () => {
    expect(sourceLabel({ kind: 'file', format: 'Amex activity CSV', files: [] })).toBe(
      'Amex activity CSV'
    );
  });
});

describe('pendingImportById', () => {
  it('throws on an id the fixture does not stage', () => {
    expect(() => pendingImportById('nope')).toThrow(/no fixture pending import nope/);
  });
});

describe('pendingSets', () => {
  it('stages exactly one open import, with the next one collecting behind it', () => {
    const open = pendingSets.openElsewhere.filter((p) => p.state === 'open');
    const next = pendingSets.openElsewhere.filter((p) => p.arrivedSinceSave !== undefined);
    expect(open).toHaveLength(1);
    expect(next).toHaveLength(1);
    expect(next[0]?.accountId).toBe(open[0]?.accountId);
  });

  it('stages one unusable draft, and only in the set that shows it', () => {
    expect(pendingSets.withUnusable.filter((p) => p.state === 'unusable')).toHaveLength(1);
    expect(pendingSets.mixed.some((p) => p.state === 'unusable')).toBe(false);
  });
});
