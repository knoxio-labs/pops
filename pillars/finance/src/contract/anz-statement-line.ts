/**
 * The layout of one line of an ANZ credit-card PDF statement.
 *
 * Split out of `anz-pdf-statement.ts` so the `raw_row` backfill can find a
 * stored line's description again without importing the whole PDF importer —
 * which reaches the REST schemas, and through them the db package, closing a
 * cycle. This module imports nothing, and it is the ONLY definition of the row
 * layout: a backfilled row and an imported one must read the same line the same
 * way.
 */

/**
 * A full transaction row: date processed, date of transaction, card last four,
 * description, amount, an optional `CR` marking money in, and the balance.
 *
 * Foreign-currency and fee supplementary rows carry no card number and so do
 * not match, which is how they are skipped. The description group is lazy so
 * the trailing figures bind to amount and balance even when the description
 * itself ends in a foreign-currency trailer.
 */
export const ANZ_STATEMENT_ROW =
  /^(\d{2}\/\d{2}\/\d{4})\s+(\d{2}\/\d{2}\/\d{4})\s+\d{4}\s+(.+?)\s+([\d,]+\.\d{2})(\s+CR)?\s+[\d,]+\.\d{2}$/;

/**
 * The description column of one statement line, or nothing when the line is not
 * a transaction row.
 *
 * Used by the PDF importer and by the backfill migration
 * (`0072_backfill_foreign_charge_from_raw_row`), which stores the whole line and
 * so has to find the description again before it can re-derive the same fields.
 */
export function anzPdfStatementLineDescription(line: string): string | undefined {
  return ANZ_STATEMENT_ROW.exec(line)?.[3];
}
