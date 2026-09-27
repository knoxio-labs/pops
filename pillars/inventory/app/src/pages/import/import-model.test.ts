import { describe, expect, it } from 'vitest';

import { CSV_COLUMNS, toCsv } from '../../foundation/list-page/inventory-csv.js';
import {
  applyMapping,
  fileRefusal,
  fieldName,
  guessMapping,
  IMPORT_MAX_ROWS,
  mappingProblems,
  readCsv,
  skippedCsv,
} from './import-model.js';

describe('guessMapping', () => {
  it('maps known headers and aliases, and skips the rest', () => {
    expect(guessMapping(['Item', 'Category', 'Qty', 'Location'])).toEqual([
      { header: 'Item', target: 'name' },
      { header: 'Category', target: 'skip' },
      { header: 'Qty', target: 'quantity' },
      { header: 'Location', target: 'where' },
    ]);
  });

  it('guesses a field once, for the first header that names it', () => {
    expect(guessMapping(['Qty', 'Count']).map((column) => column.target)).toEqual([
      'quantity',
      'skip',
    ]);
  });
});

describe('mappingProblems', () => {
  it('needs a Name column', () => {
    expect(mappingProblems([{ header: 'Qty', target: 'quantity' }])).toEqual([
      { target: 'name', message: 'Choose the column that holds each item’s name.' },
    ]);
  });

  it('refuses two columns feeding one field', () => {
    expect(
      mappingProblems([
        { header: 'Item', target: 'name' },
        { header: 'Qty', target: 'quantity' },
        { header: 'Count', target: 'quantity' },
      ])
    ).toEqual([{ target: 'quantity', message: 'Qty and Count both feed Quantity. Keep one.' }]);
  });

  it('accepts a clean mapping', () => {
    expect(mappingProblems(guessMapping(['Name', 'Code']))).toEqual([]);
  });
});

describe('applyMapping', () => {
  it('reads each mapped cell, trims it, and fills missing cells with nothing', () => {
    const mapping = guessMapping(['Colour', 'Name', 'Qty']);
    expect(
      applyMapping(
        [
          [' red ', ' Lamp ', '2'],
          ['blue', 'Rug'],
        ],
        mapping
      )
    ).toEqual([
      { name: 'Lamp', type: '', quantity: '2', code: '', where: '', note: '' },
      { name: 'Rug', type: '', quantity: '', code: '', where: '', note: '' },
    ]);
  });

  it('names targets for the screen', () => {
    expect(fieldName('skip')).toBe('Not imported');
    expect(fieldName('where')).toBe('Where');
  });
});

describe('readCsv', () => {
  it('reads quoted commas, doubled quotes and line breaks, and drops a BOM', () => {
    const rows = [
      ['Name', 'Note'],
      ['Lamp, blue', 'Said "hi"'],
      ['Desk', 'line one\r\nline two'],
    ];
    expect(readCsv(`\uFEFF${toCsv(rows)}`)).toEqual({
      headers: rows[0],
      rows: rows.slice(1),
    });
  });

  it('drops empty lines and keeps a line of empty cells as a row', () => {
    expect(readCsv('Name\r\na\r\n\r\n,,,,,\r\nb')).toEqual({
      headers: ['Name'],
      rows: [['a'], ['', '', '', '', '', ''], ['b']],
    });
  });
});

describe('fileRefusal', () => {
  it('refuses non-CSV files, header-only files, and files over the row limit', () => {
    expect(fileRefusal('garage-inventory-2025.xlsx', { rows: [['Lamp']] })).toBe(
      'garage-inventory-2025.xlsx was not read. Only CSV files can be imported. Save the sheet as CSV (comma separated) and choose it again.'
    );
    expect(fileRefusal('garage.csv', { rows: [] })).toBe(
      'garage.csv was not read. It has no rows under the header.'
    );
    expect(fileRefusal('garage.csv', { rows: Array.from({ length: IMPORT_MAX_ROWS + 1 }) })).toBe(
      'garage.csv was not read. It has more than 5,000 rows. Split it and import each part.'
    );
  });
});

describe('skippedCsv', () => {
  it('writes the file columns and a Problem column', () => {
    expect(skippedCsv(['Name', 'Quantity'], [['Lamp', 'two']], ['Quantity is not a number'])).toBe(
      'Name,Quantity,Problem\r\nLamp,two,Quantity is not a number'
    );
  });

  it('leaves an Items export mapped without changes', () => {
    expect(guessMapping([...CSV_COLUMNS, 'Custom field'])).toEqual([
      { header: 'Name', target: 'name' },
      { header: 'Type', target: 'type' },
      { header: 'Quantity', target: 'quantity' },
      { header: 'Code', target: 'code' },
      { header: 'Where', target: 'where' },
      { header: 'Note', target: 'note' },
      { header: 'Custom field', target: 'skip' },
    ]);
  });
});
