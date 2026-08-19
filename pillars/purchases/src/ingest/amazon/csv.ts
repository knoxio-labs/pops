/**
 * The bundle-shape check every Amazon DSAR file goes through before a
 * single value is read.
 *
 * Failing loudly is the point. The self-serve Order History Report was
 * retired and the DSAR layout differs by region and has changed over time,
 * so a file that does not carry the columns a parser reads is a *different
 * export format* rather than a corrupt file. A parser that half-recognises
 * an unfamiliar layout writes plausible wrong rows, and `checksum` dedup
 * then treats the corrected re-ingest as a duplicate rather than a fix.
 *
 * Papa's `errors` are checked for the same reason: ignoring them lets a
 * malformed file half-parse into exactly the rows the column check exists
 * to prevent.
 */
import Papa from 'papaparse';

import { AmazonBundleShapeError, type Row } from './columns.js';

/**
 * Parse one bundle CSV into rows, or throw {@link AmazonBundleShapeError}.
 *
 * @param csvText Raw file text.
 * @param filename The bundle's own name for the file, quoted in every error.
 * @param requiredColumns Columns the caller reads. All must be present.
 */
export function parseBundleRows(
  csvText: string,
  filename: string,
  requiredColumns: readonly string[]
): Row[] {
  const parsed = Papa.parse<Row>(csvText, {
    header: true,
    skipEmptyLines: true,
    // Load-bearing for more than whitespace: Amazon writes a UTF-8 BOM on
    // some files in the bundle, it lands on the first header name, and
    // U+FEFF is ECMAScript WhiteSpace — so `.trim()` is what keeps an
    // exact-match column check from missing a column that is right there.
    transformHeader: (header) => header.trim(),
  });

  const [firstError] = parsed.errors;
  if (firstError !== undefined) {
    throw new AmazonBundleShapeError(
      `${filename} did not parse as CSV: ${firstError.type} ${firstError.code} ` +
        `at row ${String(firstError.row ?? '?')} — ${firstError.message}`
    );
  }

  const fields = parsed.meta.fields ?? [];
  if (fields.length === 0) {
    throw new AmazonBundleShapeError(`${filename} has no header row`);
  }

  const present = new Set(fields);
  const missing = requiredColumns.filter((column) => !present.has(column));
  if (missing.length > 0) {
    throw new AmazonBundleShapeError(
      `${filename} is missing ${String(missing.length)} expected column(s): ` +
        `${missing.join(', ')}. This is a different export format, not a corrupt file — ` +
        `verify the bundle against a fresh download before widening the parser.`
    );
  }

  return parsed.data;
}
