/** The columns understood by the inventory bulk-entry grid. */
export const BULK_COLUMNS = ['name', 'type', 'quantity', 'code', 'where', 'note'] as const;

/** A column in the inventory bulk-entry grid. */
export type BulkColumn = (typeof BULK_COLUMNS)[number];

/** One bulk-entry row as text, before the server validates it. */
export type BulkDraft = Readonly<Record<BulkColumn, string>>;

/** The parsed rows and header information from pasted spreadsheet text. */
export interface PasteResult {
  rows: BulkDraft[];
  header: boolean;
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

/** An empty row used for spare grid rows and parser defaults. */
export const BLANK_DRAFT: BulkDraft = {
  name: '',
  type: '',
  quantity: '',
  code: '',
  where: '',
  note: '',
};

/** Splits one CSV line while preserving commas inside quoted cells. */
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

/** Maps a pasted header or alias to a bulk-entry column. */
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

/** Parses tab-separated or CSV text into complete, grid-ordered drafts. */
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
