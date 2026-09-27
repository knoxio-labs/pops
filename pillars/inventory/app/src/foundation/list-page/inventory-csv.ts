/** The columns shared by inventory item exports and CSV import. */
export const CSV_COLUMNS = ['Name', 'Type', 'Quantity', 'Code', 'Where', 'Note'] as const;

function csvCell(value: string): string {
  return /[",\r\n]/u.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/** Serializes rows according to RFC 4180, using CRLF row separators. */
export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}

/** One item row written by an inventory export. */
export interface ExportRow {
  readonly name: string;
  readonly typeLabel: string;
  readonly quantity: number;
  readonly code: string;
  readonly where: string;
  readonly note: string;
  /** Field label to the displayed stored or computed value. */
  readonly fields: Readonly<Record<string, string>>;
}

function fieldColumns(rows: readonly ExportRow[]): string[] {
  const columns = new Set<string>();
  for (const row of rows) {
    for (const label of Object.keys(row.fields)) columns.add(label);
  }
  return [...columns];
}

/** Serializes the six import columns followed by fields in first-seen order. */
export function exportCsv(rows: readonly ExportRow[]): string {
  const fields = fieldColumns(rows);
  return toCsv([
    [...CSV_COLUMNS, ...fields],
    ...rows.map((row) => [
      row.name,
      row.typeLabel,
      String(row.quantity),
      row.code,
      row.where,
      row.note,
      ...fields.map((label) => row.fields[label] ?? ''),
    ]),
  ]);
}

/** Returns the header row consumed by the inventory CSV importer. */
export function templateCsv(): string {
  return toCsv([CSV_COLUMNS]);
}

/** Downloads CSV text through a temporary browser anchor. */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}
