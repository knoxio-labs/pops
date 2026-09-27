import { describe, expect, it, vi } from 'vitest';

import { buildValuesCsv, downloadValuesCsv } from './reports-csv.js';
import { valuesGroup, valuesReport } from './reports-test-fixtures.js';

describe('Values CSV', () => {
  it('serializes server totals and preserves group and entry order', () => {
    const report = valuesReport({
      groups: [
        valuesGroup({
          label: 'Kitchen, main',
          entries: [
            {
              code: 'A"1',
              isContainer: false,
              itemId: 'item-1',
              name: 'Lamp\nwith quote',
              quantity: 2,
              typeKey: 'lighting',
              unitValue: 10,
              value: 999,
            },
          ],
        }),
      ],
    });

    expect(buildValuesCsv(report, 'replacement')).toBe(
      [
        'Group,Item,Code,Quantity,Replacement value,Total value',
        '"Kitchen, main","Lamp\nwith quote","A""1",2,10,999',
      ].join('\n')
    );
  });

  it('labels purchase exports with the selected basis', () => {
    expect(buildValuesCsv(valuesReport(), 'purchase')).toBe(
      'Group,Item,Code,Quantity,Price paid,Total value'
    );
  });

  it('downloads a dated UTF-8 CSV and releases its object URL', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:values');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadValuesCsv(valuesReport(), 'purchase', new Date('2026-09-27T00:00:00.000Z'));

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:values');
  });
});
