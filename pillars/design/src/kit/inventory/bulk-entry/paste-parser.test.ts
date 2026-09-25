import { describe, expect, it } from 'vitest';

import { BLANK_DRAFT, parsePaste, splitCsvLine } from './paste-parser';

describe('splitCsvLine', () => {
  it('honours quotes, commas inside them and doubled quotes', () => {
    expect(splitCsvLine('a, "b, c" ,"say ""hi"""')).toEqual(['a', 'b, c', 'say "hi"']);
    expect(splitCsvLine('')).toEqual(['']);
    expect(splitCsvLine('a,,b')).toEqual(['a', '', 'b']);
  });
});

describe('parsePaste', () => {
  it('reads tab-separated rows in grid order when there is no header', () => {
    const result = parsePaste(
      'Kettle\tKitchenware\t1\n\nToaster\tKitchenware\t2\tT9\tKitchen\tspare'
    );
    expect(result.header).toBe(false);
    expect(result.blankLines).toBe(1);
    expect(result.rows).toEqual([
      { ...BLANK_DRAFT, name: 'Kettle', type: 'Kitchenware', quantity: '1' },
      {
        name: 'Toaster',
        type: 'Kitchenware',
        quantity: '2',
        code: 'T9',
        where: 'Kitchen',
        note: 'spare',
      },
    ]);
  });

  it('maps a header in any order, by alias, and reports columns it ignores', () => {
    const result = parsePaste('Qty,Item,Location,Colour\r\n3,"Mugs, blue",Pantry,blue\r\n');
    expect(result.header).toBe(true);
    expect(result.ignoredColumns).toEqual(['Colour']);
    expect(result.blankLines).toBe(0);
    expect(result.rows).toEqual([
      { ...BLANK_DRAFT, name: 'Mugs, blue', quantity: '3', where: 'Pantry' },
    ]);
  });

  it('does not treat a first row without a name column as a header', () => {
    const result = parsePaste('Type,Code\nLamp,L1');
    expect(result.header).toBe(false);
    expect(result.rows[0]).toMatchObject({ name: 'Type', type: 'Code' });
  });

  it('returns nothing for blank input', () => {
    expect(parsePaste('  \n\n').rows).toEqual([]);
  });
});
