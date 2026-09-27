import type { WebReportsValuesResponse } from '../../inventory-api/types.gen.js';
import type { ValueReportBasis } from '../../inventory-web/useValueReport.js';

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function nullableNumber(value: number | null): string {
  return value === null ? '' : String(value);
}

/** Serializes the server-provided Values report in its displayed order. */
export function buildValuesCsv(report: WebReportsValuesResponse, basis: ValueReportBasis): string {
  const header = [
    'Group',
    'Item',
    'Code',
    'Quantity',
    basis === 'replacement' ? 'Replacement value' : 'Price paid',
    'Total value',
  ];
  const rows = report.groups.flatMap((group) =>
    group.entries.map((entry) =>
      [
        group.label,
        entry.name,
        entry.code ?? '',
        String(entry.quantity),
        nullableNumber(entry.unitValue),
        nullableNumber(entry.value),
      ]
        .map(csvCell)
        .join(',')
    )
  );
  return [header.join(','), ...rows].join('\n');
}

/** Downloads one server-provided Values report as a dated CSV file. */
export function downloadValuesCsv(
  report: WebReportsValuesResponse,
  basis: ValueReportBasis,
  now: Date = new Date()
): void {
  const csv = buildValuesCsv(report, basis);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `inventory-values-${basis}-${now.toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
