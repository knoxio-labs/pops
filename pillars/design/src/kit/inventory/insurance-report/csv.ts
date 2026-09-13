/**
 * The insurance report's row/group shapes and its CSV builder, ported from
 * `pillars/inventory/app/src/pages/insurance-report-page/csv.ts` verbatim.
 *
 * `ReportItem` is the frontend's own shape, not the API's: the API's
 * `InsuranceReportItem` also carries `type` (used server-side to sort by
 * type), but this hand-written interface never declared it. That gap is
 * pre-existing in the app, ported faithfully rather than fixed here — see
 * the report for the finding.
 */
export interface ReportItem {
  id: string;
  itemName: string;
  assetId: string | null;
  brand: string | null;
  condition: string | null;
  warrantyExpires: string | null;
  replacementValue: number | null;
  photoPath: string | null;
  locationId: string | null;
  locationName: string | null;
  receiptDocumentIds: number[];
}

export interface ReportGroup {
  locationId: string | null;
  locationName: string;
  items: ReportItem[];
}

const HEADERS = [
  'Location',
  'Name',
  'Asset ID',
  'Brand',
  'Condition',
  'Warranty Expires',
  'Replacement Value',
  'Photo',
  'Receipts',
];

export function buildCsvContent(groups: ReportGroup[]): string {
  const rows: string[][] = [HEADERS];
  for (const group of groups) {
    for (const item of group.items) {
      rows.push([
        group.locationName,
        item.itemName,
        item.assetId ?? '',
        item.brand ?? '',
        item.condition ?? '',
        item.warrantyExpires ?? '',
        item.replacementValue != null ? String(item.replacementValue) : '',
        item.photoPath ? 'Yes' : 'No',
        item.receiptDocumentIds.map((id) => `#${id}`).join(', '),
      ]);
    }
  }
  return rows
    .map((row) => row.map((cell) => `"${cell.replaceAll(/"/g, '""')}"`).join(','))
    .join('\n');
}
