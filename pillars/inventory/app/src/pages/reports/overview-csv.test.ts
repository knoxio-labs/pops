import { describe, expect, it, vi } from 'vitest';

import { buildOverviewCsv, downloadOverviewCsv } from './overview-csv.js';
import { valuesGroup, valuesReport } from './reports-test-fixtures.js';
import { warrantyRows } from './warranty-model.js';

import type { ReportEntry } from '../../inventory-web/useReportEntries.js';

const entry: ReportEntry = {
  code: null,
  effectiveLocationId: 'garage',
  isContainer: false,
  photos: 1,
  place: 'Garage',
  purchasePrice: 40,
  purchasedOn: '2025-01-01',
  quantity: 1,
  receiptId: null,
  replacementValue: 100,
  room: { key: 'garage', label: 'Garage' },
  typeKey: 'misc',
  warrantyExpires: '2026-10-01',
  itemId: 'lamp-1',
  name: 'Lamp',
};

describe('Overview CSV', () => {
  it('serializes server figures, group shares, and visible warranty rows', () => {
    const report = valuesReport({
      groups: [valuesGroup({ label: 'Garage', share: 0.75, value: 100 })],
      totals: {
        purchase: 40,
        records: 1,
        replacement: 100,
        units: 1,
        unvalued: 2,
        withoutPhoto: 3,
      },
    });
    const rows = warrantyRows([entry], new Date(2026, 8, 25));

    expect(buildOverviewCsv(report, rows)).toBe(
      [
        'Section,Label,Value,Detail',
        'Figure,Replacement value,100,',
        'Figure,Paid,40,',
        'Figure,Counted,1,1 units',
        'Figure,Unvalued,2,',
        'Figure,Without photo,3,',
        'Value by room,Garage,100,75% share',
        'Ending in 90 days,Lamp,2026-10-01,In 6 days',
      ].join('\n')
    );
  });

  it('downloads a UTF-8 CSV and releases its object URL', () => {
    const createObjectUrl = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:overview');
    const revokeObjectUrl = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    downloadOverviewCsv(valuesReport(), []);

    expect(createObjectUrl).toHaveBeenCalledWith(expect.any(Blob));
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith('blob:overview');
  });
});
