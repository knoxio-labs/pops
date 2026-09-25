import { describe, expect, it } from 'vitest';

import { applyMapping, fieldName, guessMapping, mappingProblems } from './import-model';

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
