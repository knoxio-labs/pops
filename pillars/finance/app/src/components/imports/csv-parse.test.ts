import { describe, expect, it } from 'vitest';

import { bankDialect } from './bank-dialect';
import { parseAllFiles } from './csv-parse';

function csvFile(name: string, contents: string): File {
  return new File([contents], name, { type: 'text/csv' });
}

/** A headerless ANZ credit-card export: date, amount, description, five empty columns. */
function headerlessAnzExport(lineCount: number): string {
  return (
    Array.from(
      { length: lineCount },
      (_unused, index) =>
        `${String((index % 28) + 1).padStart(2, '0')}/07/2026,-${(index + 1).toFixed(2)},MERCHANT ${index + 1},,,,,`
    ).join('\r\n') + '\r\n'
  );
}

const HEADED_EXPORT =
  'Date,Description,Amount\r\n01/01/2026,Rent,-900.00\r\n02/01/2026,Coffee,-4.50\r\n';

async function parseOne(contents: string, bank: Parameters<typeof bankDialect>[0]) {
  const result = await parseAllFiles([csvFile('export.csv', contents)], bankDialect(bank));
  return result;
}

describe('parseAllFiles — a headerless export under a bank declared as headed', () => {
  it('keeps every line as a row instead of consuming the first charge as the header', async () => {
    const lineCount = 556;
    const contents = headerlessAnzExport(lineCount);

    const { error, parsed } = await parseOne(contents, 'ANZ');

    expect(error).toBeUndefined();
    const [file] = parsed;
    expect(file).toBeDefined();
    // The count is the whole bug: 555 rows from 556 lines loses a real charge
    // with nothing in the UI to show for it.
    expect(file?.rows).toHaveLength(lineCount);
    expect(file?.rows).toHaveLength(contents.trimEnd().split('\r\n').length);
  });

  it('does not name the columns after the first transaction', async () => {
    const { parsed } = await parseOne(headerlessAnzExport(3), 'ANZ');

    expect(parsed[0]?.headers).not.toContain('01/07/2026');
    expect(parsed[0]?.headers).not.toContain('MERCHANT 1');
    expect(parsed[0]?.headers).toEqual([
      'Column 1',
      'Column 2',
      'Column 3',
      'Column 4',
      'Column 5',
      'Column 6',
      'Column 7',
      'Column 8',
    ]);
  });

  it('keeps the first transaction addressable in the row set', async () => {
    const { parsed } = await parseOne(headerlessAnzExport(3), 'ANZ');

    expect(parsed[0]?.rows[0]).toMatchObject({
      'Column 1': '01/07/2026',
      'Column 2': '-1.00',
      'Column 3': 'MERCHANT 1',
    });
  });
});

describe('parseAllFiles — a headed export under a bank declared as headerless', () => {
  // Unlike the reverse direction above, this one cannot self-heal: a
  // headerless dialect has no column names of its own to recover once the
  // header row is stripped, so it is surfaced as a format mismatch instead of
  // being guessed at (POPS-2854).
  it('reports a format mismatch instead of guessing at the file', async () => {
    const { error, formatMismatch, parsed } = await parseOne(HEADED_EXPORT, 'ANZ Credit Card');

    expect(error).toBeUndefined();
    expect(formatMismatch).toBe('Date,Description,Amount');
    expect(parsed).toEqual([]);
  });
});

describe('parseAllFiles — the bank and the file agree', () => {
  it('reads a headed export under a headed bank unchanged', async () => {
    const { parsed } = await parseOne(HEADED_EXPORT, 'ANZ');

    expect(parsed[0]?.headers).toEqual(['Date', 'Description', 'Amount']);
    expect(parsed[0]?.rows).toHaveLength(2);
  });

  it("names a headerless export's columns from the dialect", async () => {
    const { parsed } = await parseOne(headerlessAnzExport(2), 'ANZ Credit Card');

    expect(parsed[0]?.headers.slice(0, 3)).toEqual(['Date', 'Amount', 'Description']);
    expect(parsed[0]?.rows).toHaveLength(2);
    expect(parsed[0]?.rows[0]?.Amount).toBe('-1.00');
  });
});

describe('parseAllFiles — column naming', () => {
  it('names blank header cells positionally so they are selectable', async () => {
    const { parsed } = await parseOne('Date,,Amount\r\n01/01/2026,Rent,-900.00\r\n', 'ANZ');

    expect(parsed[0]?.headers).toEqual(['Date', 'Column 2', 'Amount']);
    expect(parsed[0]?.rows[0]?.['Column 2']).toBe('Rent');
  });

  it('keeps repeated header names distinct rather than collapsing the columns', async () => {
    const { parsed } = await parseOne('Date,Amount,Amount\r\n01/01/2026,-900.00,-4.50\r\n', 'ANZ');

    expect(parsed[0]?.headers).toEqual(['Date', 'Amount', 'Amount_1']);
    expect(parsed[0]?.rows[0]).toMatchObject({ Amount: '-900.00', Amount_1: '-4.50' });
  });

  it('keeps cells beyond the declared columns rather than truncating the row', async () => {
    const { parsed } = await parseOne(
      '01/07/2026,-1.00,MERCHANT,,,,,,SURPLUS\r\n',
      'ANZ Credit Card'
    );

    expect(parsed[0]?.headers).toHaveLength(9);
    expect(parsed[0]?.rows[0]?.['Column 9']).toBe('SURPLUS');
  });

  it('drops a byte order mark from the first column name', async () => {
    const { parsed } = await parseOne('\uFEFFDate,Amount\r\n01/01/2026,-900.00\r\n', 'ANZ');

    expect(parsed[0]?.headers).toEqual(['Date', 'Amount']);
  });
});

describe('parseAllFiles — files with no transactions', () => {
  it('reports a header-only file as empty rather than importing nothing silently', async () => {
    const { error, parsed } = await parseOne('Date,Description,Amount\r\n', 'ANZ');

    expect(error).toMatch(/export\.csv: CSV file is empty/);
    expect(parsed).toEqual([]);
  });

  it('names the file when an empty upload cannot be parsed at all', async () => {
    const { error, parsed } = await parseOne('', 'ANZ');

    expect(error).toMatch(/^export\.csv: /);
    expect(parsed).toEqual([]);
  });
});
