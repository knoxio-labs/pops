import type { ReportTab } from './reports-model.js';

/** Returns the canonical search string for a Reports tab. */
export function reportsSearch(tab: ReportTab): string {
  return tab === 'overview' ? '' : `?tab=${tab}`;
}

/**
 * Appends a tab's own search to the parameters of `search`. The overview tab
 * omits its default tab parameter.
 */
export function reportsSearchWith(tab: ReportTab, search: string): string {
  const tabSearch = reportsSearch(tab);
  const params = search.startsWith('?') ? search.slice(1) : search;
  if (tabSearch === '') return params === '' ? '' : `?${params}`;
  return params === '' ? tabSearch : `${tabSearch}&${params}`;
}

/** Formats a whole-dollar value in the app's Australian locale. */
export function formatDollars(value: number): string {
  return `$${Math.round(value).toLocaleString('en-AU')}`;
}

/** Escapes a CSV cell only when it contains CSV-significant characters. */
function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Serializes a header and rows in display order without a trailing newline. */
export function toCsv(header: readonly string[], rows: readonly (readonly string[])[]): string {
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
}

/** Downloads CSV text as a UTF-8 file and releases the temporary object URL. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
