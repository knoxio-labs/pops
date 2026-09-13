import { describe, expect, it } from 'vitest';

import { buildCsvContent } from './csv';

import type { ReportGroup } from './csv';

describe('buildCsvContent', () => {
  it('writes the header row even with no groups', () => {
    expect(buildCsvContent([])).toBe(
      '"Location","Name","Asset ID","Brand","Condition","Warranty Expires","Replacement Value","Photo","Receipts"'
    );
  });

  it('writes one row per item, grouped location repeated on every row', () => {
    const groups: ReportGroup[] = [
      {
        locationId: 'loc-1',
        locationName: 'Living Room',
        items: [
          {
            id: 'item-1',
            itemName: 'Television',
            assetId: 'TV-001',
            brand: 'Samsung',
            condition: 'good',
            warrantyExpires: '2027-06-15',
            replacementValue: 2000,
            photoPath: 'tv.jpg',
            locationId: 'loc-1',
            locationName: 'Living Room',
            receiptDocumentIds: [1234, 5678],
          },
        ],
      },
    ];
    const lines = buildCsvContent(groups).split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe(
      '"Living Room","Television","TV-001","Samsung","good","2027-06-15","2000","Yes","#1234, #5678"'
    );
  });

  it('renders null fields as empty cells rather than the literal string "null"', () => {
    const groups: ReportGroup[] = [
      {
        locationId: null,
        locationName: 'No Location',
        items: [
          {
            id: 'item-2',
            itemName: 'Sofa',
            assetId: null,
            brand: null,
            condition: null,
            warrantyExpires: null,
            replacementValue: null,
            photoPath: null,
            locationId: null,
            locationName: null,
            receiptDocumentIds: [],
          },
        ],
      },
    ];
    expect(buildCsvContent(groups).split('\n')[1]).toBe(
      '"No Location","Sofa","","","","","","No",""'
    );
  });

  it('escapes embedded double quotes by doubling them, per RFC 4180', () => {
    const groups: ReportGroup[] = [
      {
        locationId: 'loc-1',
        locationName: 'Study',
        items: [
          {
            id: 'item-3',
            itemName: '24" monitor',
            assetId: null,
            brand: null,
            condition: null,
            warrantyExpires: null,
            replacementValue: 0,
            photoPath: null,
            locationId: 'loc-1',
            locationName: 'Study',
            receiptDocumentIds: [],
          },
        ],
      },
    ];
    const line = buildCsvContent(groups).split('\n')[1]!;
    expect(line).toContain('"24"" monitor"');
    expect(line).toContain('"0"');
  });
});
