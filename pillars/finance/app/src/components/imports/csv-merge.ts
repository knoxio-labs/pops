export interface ParsedCsvFile {
  fileName: string;
  headers: string[];
  rows: Record<string, string>[];
}

export interface HeaderDiff {
  missing: string[];
  extra: string[];
}

export interface MergeResult {
  ok: boolean;
  error?: string;
  headers: string[];
  rows: Record<string, string>[];
}

/**
 * Compare a candidate file's headers against the batch's first file. Order is
 * ignored — Papa Parse keys rows by header name, so only the set matters.
 */
export function diffHeaders(base: string[], candidate: string[]): HeaderDiff {
  const baseSet = new Set(base);
  const candidateSet = new Set(candidate);
  return {
    missing: base.filter((h) => !candidateSet.has(h)),
    extra: candidate.filter((h) => !baseSet.has(h)),
  };
}

function describeDiff(diff: HeaderDiff): string {
  const parts: string[] = [];
  if (diff.missing.length > 0) parts.push(`missing ${diff.missing.join(', ')}`);
  if (diff.extra.length > 0) parts.push(`unexpected ${diff.extra.join(', ')}`);
  return parts.join('; ');
}

function rowIdentity(row: Record<string, string>, headers: string[]): string {
  return JSON.stringify(headers.map((h) => row[h] ?? ''));
}

/**
 * Merge rows across files, dropping only the overlap between them.
 *
 * Consecutive statement exports repeat the days they share, so the same line
 * arrives once per file. A line repeated *inside* one file is different: banks
 * legitimately list two identical purchases made on the same day, and those are
 * two transactions. So a given row content is kept as many times as the file
 * that lists it most — not the sum across files, and never fewer than one file
 * showed. Deduping later by checksum could not draw this distinction, because
 * by then the file boundaries are gone.
 */
function mergeRows(files: ParsedCsvFile[], headers: string[]): Record<string, string>[] {
  const keptCounts = new Map<string, number>();
  const merged: Record<string, string>[] = [];

  for (const file of files) {
    const seenInFile = new Map<string, number>();
    for (const row of file.rows) {
      const identity = rowIdentity(row, headers);
      const occurrence = (seenInFile.get(identity) ?? 0) + 1;
      seenInFile.set(identity, occurrence);
      if (occurrence > (keptCounts.get(identity) ?? 0)) {
        keptCounts.set(identity, occurrence);
        merged.push(row);
      }
    }
  }

  return merged;
}

/**
 * Concatenate several same-schema CSVs into the single row list the rest of the
 * wizard consumes. The first file defines the schema and the header order; any
 * file that disagrees fails the whole merge by name rather than being dropped.
 */
export function mergeParsedFiles(files: ParsedCsvFile[]): MergeResult {
  const [first, ...rest] = files;
  if (!first) return { ok: false, error: 'Please select a file', headers: [], rows: [] };

  for (const file of rest) {
    const diff = diffHeaders(first.headers, file.headers);
    if (diff.missing.length > 0 || diff.extra.length > 0) {
      return {
        ok: false,
        error: `"${file.fileName}" has different columns to "${first.fileName}" — ${describeDiff(diff)}. Every file in one import must share the same columns.`,
        headers: [],
        rows: [],
      };
    }
  }

  return {
    ok: true,
    headers: first.headers,
    rows: mergeRows(files, first.headers),
  };
}
