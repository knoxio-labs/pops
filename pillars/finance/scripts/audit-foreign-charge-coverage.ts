/**
 * Read-only report on how much of the ledger carries country and foreign-charge
 * detail, and how much of what is missing is still recoverable from `raw_row`
 * (POPS-2633).
 *
 *   pnpm --filter @pops/finance exec tsx scripts/audit-foreign-charge-coverage.ts
 *
 * Migration `0072_backfill_foreign_charge_from_raw_row` fills those columns but
 * cannot report what it did — a SQL migration has nowhere to say it. Run this
 * before and after: it is what makes "the backfill found nothing" distinguishable
 * from "the backfill did not run", which are the same empty column otherwise.
 *
 * It re-derives through the same `parseRawRowForeignFields` the migration uses,
 * so `recoverable` after a successful run is zero by construction. A non-zero
 * `recoverable` on a migrated database means rows arrived since, or the
 * migration did not reach this database.
 *
 * `unreadable` counts rows STATING foreign detail that does not parse — the
 * condition the migration aborts on. Non-zero here is a format drift to
 * investigate, not a number to accept.
 *
 * Exits 0 whether or not anything is found: this reports, it does not gate.
 * It writes nothing.
 */
import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import { openFinanceDb, transactions } from '../src/db/index.js';
import { parseRawRowForeignFields } from '../src/db/raw-row-foreign-charge.js';

interface Coverage {
  total: number;
  withForeignCharge: number;
  withCountry: number;
  /** No foreign charge stored, and `raw_row` still holds one. */
  recoverableForeignCharge: number;
  /** No country stored, and `raw_row` still yields one. */
  recoverableCountry: number;
  /** `raw_row` states foreign detail that does not parse. The migration aborts on these. */
  unreadable: number;
  /** No `raw_row` at all, so nothing about these rows can be recovered. */
  withoutRawRow: number;
}

function measure(
  rows: readonly {
    country: string | null;
    foreignCurrency: string | null;
    rawRow: string | null;
  }[]
): Coverage {
  const coverage: Coverage = {
    total: rows.length,
    withForeignCharge: 0,
    withCountry: 0,
    recoverableForeignCharge: 0,
    recoverableCountry: 0,
    unreadable: 0,
    withoutRawRow: 0,
  };
  for (const row of rows) {
    if (row.foreignCurrency !== null) coverage.withForeignCharge += 1;
    if (row.country !== null) coverage.withCountry += 1;
    if (row.rawRow === null) {
      coverage.withoutRawRow += 1;
      continue;
    }
    const fields = parseRawRowForeignFields(row.rawRow);
    if (fields.unreadable) coverage.unreadable += 1;
    if (row.foreignCurrency === null && fields.foreignCharge !== undefined) {
      coverage.recoverableForeignCharge += 1;
    }
    if (row.country === null && fields.country !== undefined) coverage.recoverableCountry += 1;
  }
  return coverage;
}

function main(): void {
  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const rows = opened.db
      .select({
        country: transactions.country,
        foreignCurrency: transactions.foreignCurrency,
        rawRow: transactions.rawRow,
      })
      .from(transactions)
      .all();
    const coverage = measure(rows);
    for (const [label, value] of Object.entries(coverage)) {
      console.warn(`${label}: ${value}`);
    }
  } finally {
    opened.raw.close();
  }
}

main();
