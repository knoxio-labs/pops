/**
 * Turns rows pasted from a spreadsheet (tab separated) or a CSV file into
 * bulk-entry drafts. A first line whose cells are all column names is a
 * header and decides the column order; otherwise columns are read in the
 * grid's own order. Blank lines are dropped and counted.
 */

/** The grid's columns, in the order it draws them. */
export const BULK_COLUMNS = ['name', 'type', 'quantity', 'code', 'where', 'note'] as const;

/** One grid column. */
export type BulkColumn = (typeof BULK_COLUMNS)[number];

/** One row as typed or pasted: every cell is text until validation reads it. */
export type BulkDraft = Readonly<Record<BulkColumn, string>>;

/** What a paste produced. */
export interface PasteResult {
  rows: BulkDraft[];
  /** Whether the first line was read as column names. */
  header: boolean;
  /** Pasted columns no grid column matched, by their header text. */
  ignoredColumns: string[];
  blankLines: number;
}

const ALIASES: Readonly<Record<string, BulkColumn>> = {
  name: 'name',
  item: 'name',
  type: 'type',
  quantity: 'quantity',
  qty: 'quantity',
  count: 'quantity',
  code: 'code',
  where: 'where',
  location: 'where',
  place: 'where',
  container: 'where',
  note: 'note',
  notes: 'note',
};

/** A draft with every cell empty. */
export const BLANK_DRAFT: BulkDraft = {
  name: '',
  type: '',
  quantity: '',
  code: '',
  where: '',
  note: '',
};

/** Splits one CSV line, honouring double quotes and doubled quotes inside them. */
export function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted && char === '"' && line[index + 1] === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === ',' && !quoted) {
      cells.push(cell);
      cell = '';
    } else {
      cell += char;
    }
  }
  cells.push(cell);
  return cells.map((value) => value.trim());
}

function splitLine(line: string, tabbed: boolean): string[] {
  return tabbed ? line.split('\t').map((value) => value.trim()) : splitCsvLine(line);
}

/** The grid column a header names, by name or a common alias; null when none. */
export function columnForHeader(header: string): BulkColumn | null {
  return ALIASES[header.trim().toLowerCase()] ?? null;
}

function headerColumns(cells: readonly string[]): (BulkColumn | null)[] | null {
  const mapped = cells.map(columnForHeader);
  return mapped.some((column) => column === 'name') ? mapped : null;
}

function toDraft(cells: readonly string[], columns: readonly (BulkColumn | null)[]): BulkDraft {
  const draft: Record<BulkColumn, string> = { ...BLANK_DRAFT };
  columns.forEach((column, index) => {
    if (column !== null) draft[column] = cells[index] ?? '';
  });
  return draft;
}

/** Parses pasted text into drafts. */
export function parsePaste(text: string): PasteResult {
  const lines = text.replace(/\r\n?/gu, '\n').split('\n');
  const content = lines.filter((line) => line.trim() !== '');
  const blankLines = lines.length - content.length - (text.endsWith('\n') ? 1 : 0);
  const tabbed = content.some((line) => line.includes('\t'));
  const [first, ...rest] = content.map((line) => splitLine(line, tabbed));
  if (first === undefined) return { rows: [], header: false, ignoredColumns: [], blankLines };
  const header = headerColumns(first);
  const columns = header ?? BULK_COLUMNS;
  const body = header === null ? [first, ...rest] : rest;
  return {
    rows: body.map((cells) => toDraft(cells, columns)),
    header: header !== null,
    ignoredColumns: header === null ? [] : first.filter((_, index) => header[index] === null),
    blankLines: Math.max(0, blankLines),
  };
}
