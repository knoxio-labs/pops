import { describe, expect, it } from 'vitest';

import { acceptedExtensions, describeAcceptedTypes, hasAcceptedExtension } from './accepted-types';

describe('acceptedExtensions', () => {
  it('reads one extension', () => {
    expect(acceptedExtensions('.csv')).toEqual(['.csv']);
  });

  it('reads several, ignoring the spacing an author might use', () => {
    expect(acceptedExtensions('.csv, .PDF')).toEqual(['.csv', '.pdf']);
  });

  it('ignores MIME entries, which name no extension to match a file name against', () => {
    expect(acceptedExtensions('text/csv,.csv')).toEqual(['.csv']);
  });

  it('ignores a bare dot', () => {
    expect(acceptedExtensions('.')).toEqual([]);
  });
});

describe('hasAcceptedExtension', () => {
  it('matches regardless of the case the file was named in', () => {
    expect(hasAcceptedExtension('Statement.PDF', '.csv,.pdf')).toBe(true);
  });

  it('rejects a type the picker does not offer', () => {
    expect(hasAcceptedExtension('statement.pdf', '.csv')).toBe(false);
  });

  it('rejects a name that merely contains the extension', () => {
    expect(hasAcceptedExtension('csv-notes.txt', '.csv')).toBe(false);
  });
});

describe('describeAcceptedTypes', () => {
  it.each([
    ['.csv', 'CSV'],
    ['.csv,.pdf', 'CSV or PDF'],
    ['.csv,.pdf,.ofx', 'CSV, PDF or OFX'],
  ])('reads %s as %s', (accepted, expected) => {
    expect(describeAcceptedTypes(accepted)).toBe(expected);
  });

  it('says something rather than nothing when no extension is named', () => {
    expect(describeAcceptedTypes('text/csv')).toBe('file');
  });
});
