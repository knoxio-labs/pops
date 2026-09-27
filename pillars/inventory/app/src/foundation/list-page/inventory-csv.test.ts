import { describe, expect, it, vi } from 'vitest';

import {
  CSV_COLUMNS,
  downloadCsv,
  exportCsv,
  templateCsv,
  toCsv,
  type ExportRow,
} from './inventory-csv.js';

describe('toCsv', () => {
  it('quotes commas, quotes and newlines and doubles quotes', () => {
    expect(toCsv([['plain', 'a,b', 'a"b', 'a\r\nb']])).toBe('plain,"a,b","a""b","a\r\nb"');
  });
});

describe('exportCsv', () => {
  it('writes the six import columns first, then field labels in first-seen order', () => {
    const rows: ExportRow[] = [
      {
        name: 'Lamp',
        typeLabel: 'Light',
        quantity: 2,
        code: 'L-1',
        where: 'Desk',
        note: 'Read, later',
        fields: { Colour: 'red', Size: 'large' },
      },
      {
        name: 'Torch',
        typeLabel: 'Light',
        quantity: 1,
        code: '',
        where: '',
        note: '',
        fields: { Size: 'small', Battery: 'AA' },
      },
    ];

    expect(exportCsv(rows)).toBe(
      'Name,Type,Quantity,Code,Where,Note,Colour,Size,Battery\r\n' +
        'Lamp,Light,2,L-1,Desk,"Read, later",red,large,\r\n' +
        'Torch,Light,1,,,,,small,AA'
    );
  });
});

describe('templateCsv', () => {
  it('is the header row only', () => {
    expect(templateCsv()).toBe(CSV_COLUMNS.join(','));
  });
});

describe('downloadCsv', () => {
  it('clicks a temporary link and releases its object URL', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:inventory');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadCsv('inventory-items-2026-09-27.csv', 'Name\r\n');

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:inventory');
  });
});
