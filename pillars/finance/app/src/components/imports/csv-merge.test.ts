import { describe, expect, it } from 'vitest';

import { diffHeaders, mergeParsedFiles, type ParsedCsvFile } from './csv-merge';

const HEADERS = ['Date', 'Description', 'Amount'];

function row(date: string, description: string, amount: string): Record<string, string> {
  return { Date: date, Description: description, Amount: amount };
}

function file(fileName: string, rows: Record<string, string>[]): ParsedCsvFile {
  return { fileName, headers: HEADERS, rows };
}

describe('diffHeaders', () => {
  it('treats a reordered header set as identical', () => {
    expect(diffHeaders(['A', 'B'], ['B', 'A'])).toEqual({ missing: [], extra: [] });
  });

  it('reports both directions of a mismatch', () => {
    expect(diffHeaders(['A', 'B'], ['A', 'C'])).toEqual({ missing: ['B'], extra: ['C'] });
  });
});

describe('mergeParsedFiles — schema agreement', () => {
  it('rejects the batch by name when a later file has different columns', () => {
    const result = mergeParsedFiles([
      file('jan.csv', [row('01/01/2026', 'Coffee', '-4.50')]),
      { fileName: 'feb.csv', headers: ['Date', 'Amount'], rows: [] },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('feb.csv');
    expect(result.error).toContain('jan.csv');
    expect(result.error).toContain('missing Description');
    expect(result.rows).toEqual([]);
  });

  it('names the unexpected column when a later file has an extra one', () => {
    const result = mergeParsedFiles([
      file('jan.csv', []),
      { fileName: 'feb.csv', headers: [...HEADERS, 'Balance'], rows: [] },
    ]);

    expect(result.ok).toBe(false);
    expect(result.error).toContain('unexpected Balance');
  });

  it('accepts a later file whose columns are merely reordered', () => {
    const reordered = { Amount: '-4.50', Date: '01/01/2026', Description: 'Coffee' };
    const result = mergeParsedFiles([
      file('jan.csv', [row('01/01/2026', 'Rent', '-900.00')]),
      { fileName: 'feb.csv', headers: ['Amount', 'Date', 'Description'], rows: [reordered] },
    ]);

    expect(result.ok).toBe(true);
    expect(result.headers).toEqual(HEADERS);
    expect(result.rows).toHaveLength(2);
  });

  it('errors rather than merging nothing when no file was supplied', () => {
    const result = mergeParsedFiles([]);
    expect(result.ok).toBe(false);
    expect(result.error).toBe('Please select at least one file');
  });
});

describe('mergeParsedFiles — overlap between files', () => {
  it('concatenates files that do not overlap', () => {
    const result = mergeParsedFiles([
      file('jan.csv', [row('01/01/2026', 'Rent', '-900.00')]),
      file('feb.csv', [row('01/02/2026', 'Rent', '-900.00')]),
    ]);

    expect(result.rows).toEqual([
      row('01/01/2026', 'Rent', '-900.00'),
      row('01/02/2026', 'Rent', '-900.00'),
    ]);
  });

  it('keeps one copy of a row that both exports list', () => {
    const shared = row('31/01/2026', 'Coffee', '-4.50');
    const result = mergeParsedFiles([
      file('jan.csv', [row('01/01/2026', 'Rent', '-900.00'), shared]),
      file('feb.csv', [shared, row('02/02/2026', 'Rent', '-900.00')]),
    ]);

    expect(result.rows).toEqual([
      row('01/01/2026', 'Rent', '-900.00'),
      shared,
      row('02/02/2026', 'Rent', '-900.00'),
    ]);
  });

  it('preserves two identical purchases made on the same day within one file', () => {
    const coffee = row('01/01/2026', 'Coffee', '-4.50');
    const result = mergeParsedFiles([file('jan.csv', [coffee, coffee])]);

    expect(result.rows).toHaveLength(2);
  });

  it('keeps both copies when the overlapping day genuinely holds two of the same purchase', () => {
    const coffee = row('31/01/2026', 'Coffee', '-4.50');
    const result = mergeParsedFiles([
      file('jan.csv', [coffee, coffee]),
      file('feb.csv', [coffee, coffee]),
    ]);

    expect(result.rows).toHaveLength(2);
  });

  it('takes the larger count when the two files disagree on how many times a row occurs', () => {
    const coffee = row('31/01/2026', 'Coffee', '-4.50');
    const result = mergeParsedFiles([file('jan.csv', [coffee]), file('feb.csv', [coffee, coffee])]);

    expect(result.rows).toHaveLength(2);
  });

  it('compares rows on mapped columns only, so a reordered file still deduplicates', () => {
    const shared = row('31/01/2026', 'Coffee', '-4.50');
    const result = mergeParsedFiles([
      file('jan.csv', [shared]),
      {
        fileName: 'feb.csv',
        headers: ['Amount', 'Date', 'Description'],
        rows: [{ Amount: '-4.50', Date: '31/01/2026', Description: 'Coffee' }],
      },
    ]);

    expect(result.rows).toHaveLength(1);
  });

  it('does not collapse rows that differ only in an unmapped trailing column', () => {
    const headers = [...HEADERS, 'Balance'];
    const result = mergeParsedFiles([
      {
        fileName: 'jan.csv',
        headers,
        rows: [
          { ...row('01/01/2026', 'Coffee', '-4.50'), Balance: '100.00' },
          { ...row('01/01/2026', 'Coffee', '-4.50'), Balance: '95.50' },
        ],
      },
    ]);

    expect(result.rows).toHaveLength(2);
  });
});
