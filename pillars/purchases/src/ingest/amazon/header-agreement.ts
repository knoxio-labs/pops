/**
 * Guards against an order whose "header" — the facts recorded once per
 * order rather than once per line — is not actually one fact.
 *
 * Both Amazon adapters read a header field from the first row of an order's
 * group and never check the rest of the group against it. That is correct
 * wherever every row genuinely restates the same value, and silent wherever
 * they do not — a currency mismatch is the one that can misstate money,
 * because summing amounts stated in two currencies lands a number in
 * neither. Shared here so a reader learns one comparison, not two.
 */
import type { AmazonAnomaly, Row } from './columns.js';

/**
 * One column that must read the same on every row of an order's group.
 *
 * `normalize` maps the raw cell to the value actually compared — an ISO
 * instant for a date, an upper-cased code for a currency — so two cells
 * spelling the same fact differently are not reported as a disagreement.
 * `null` means the cell could not be read at all, which is a different
 * failure reported separately by whichever reader normally consumes the
 * column, so it is never compared.
 */
export interface HeaderField {
  readonly column: string;
  readonly normalize: (raw: string | undefined) => string | null;
}

/** A header field stated two different ways within one order's rows. */
export interface HeaderDisagreement {
  readonly column: string;
  readonly first: string;
  readonly other: string;
}

/**
 * Find the first header field that disagrees somewhere in an order's rows.
 *
 * Every row is compared against the FIRST row's value for that field,
 * because the first row is the one the adapters go on to store — the
 * question is whether using it would misstate some other row, not whether
 * the rows form agreeing clusters.
 */
export function findHeaderDisagreement(
  rows: readonly Row[],
  fields: readonly HeaderField[]
): HeaderDisagreement | null {
  const first = rows[0];
  if (first === undefined) return null;

  for (const field of fields) {
    const referenceRaw = first[field.column];
    const reference = field.normalize(referenceRaw);
    if (reference === null) continue;

    for (const row of rows) {
      const raw = row[field.column];
      const normalized = field.normalize(raw);
      if (normalized === null || normalized === reference) continue;
      return { column: field.column, first: referenceRaw ?? '', other: raw ?? '' };
    }
  }

  return null;
}

/**
 * {@link findHeaderDisagreement}, reporting a disagreement as a
 * `dropped-order` anomaly — the mechanism both adapters already use for a
 * row they refuse to turn into spend.
 *
 * Returns whether a disagreement was found, so the caller can drop the
 * order in one line rather than repeating the anomaly-then-return dance.
 */
export function reportHeaderDisagreement(
  rows: readonly Row[],
  fields: readonly HeaderField[],
  sourceOrderId: string,
  anomalies: AmazonAnomaly[]
): boolean {
  const disagreement = findHeaderDisagreement(rows, fields);
  if (disagreement === null) return false;

  anomalies.push({
    kind: 'dropped-order',
    sourceOrderId,
    detail:
      `rows disagree on ${disagreement.column}: "${disagreement.first}" vs ` +
      `"${disagreement.other}"`,
  });
  return true;
}
