import { downloadCsv, toCsv } from './report-model.js';
import { daysLabel } from './warranty-model.js';

import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { WarrantyRow } from './warranty-model.js';

/** Serializes the server-provided overview figures and visible panel rows. */
export function buildOverviewCsv(
  report: WebReportsValuesResponse,
  endingRows: readonly WarrantyRow[]
): string {
  const rows: string[][] = [
    ['Figure', 'Replacement value', String(report.totals.replacement), ''],
    ['Figure', 'Paid', String(report.totals.purchase), ''],
    ['Figure', 'Counted', String(report.totals.records), `${report.totals.units} units`],
    ['Figure', 'Unvalued', String(report.totals.unvalued), ''],
    ['Figure', 'Without photo', String(report.totals.withoutPhoto), ''],
    ...report.groups.map((group) => [
      'Value by room',
      group.label,
      String(group.value),
      `${Math.round(group.share * 100)}% share`,
    ]),
    ...endingRows.map((row) => [
      'Ending in 90 days',
      row.entry.name,
      row.expires,
      daysLabel(row.days),
    ]),
  ];
  return toCsv(['Section', 'Label', 'Value', 'Detail'], rows);
}

/** Downloads the current overview as a CSV file. */
export function downloadOverviewCsv(
  report: WebReportsValuesResponse,
  endingRows: readonly WarrantyRow[]
): void {
  downloadCsv(buildOverviewCsv(report, endingRows), 'inventory-reports-overview.csv');
}
