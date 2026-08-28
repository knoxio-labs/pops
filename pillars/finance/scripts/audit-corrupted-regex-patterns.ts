/**
 * Read-only audit for regex rules corrupted on write (POPS-2600).
 *
 * `transaction_corrections` normalized every pattern unconditionally before
 * that ticket, including `matchType: 'regex'` ones. `normalizeDescription`
 * uppercases (`\d` -> `\D`, `\s` -> `\S`, `\w` -> `\W`, `\b` -> `\B` — each an
 * inverted class), strips digits out of quantifiers (`a{2,3}` -> `a{,}`) and
 * deletes the `.` wildcard, so a regex correction stored before the fix does
 * not mean what its author wrote.
 *
 * The transform is LOSSY — a deleted `.` and a stripped digit cannot be put
 * back — so there is no automatic reversal and this script writes nothing. It
 * lists the affected rows for manual re-authoring (POPS-254's cleanup pass).
 *
 * `transaction_tag_rules` has stored regex patterns raw since it was written,
 * so it is audited only to confirm that.
 *
 *   pnpm --filter @pops/finance exec tsx scripts/audit-corrupted-regex-patterns.ts
 *
 * Exits 0 whether or not anything is found — this reports, it does not gate.
 */
import { eq } from 'drizzle-orm';

import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import { openFinanceDb, transactionCorrections, transactionTagRules } from '../src/db/index.js';

/** Metacharacter classes that only exist as the uppercase (inverted) form after normalization. */
const INVERTED_CLASS = /\\[DSWB]/;
/** `{2,3}` survives normalization as `{,}` — a quantifier with its bounds stripped. */
const GUTTED_QUANTIFIER = /\{,?}/;

interface Finding {
  table: string;
  id: string;
  pattern: string;
  reasons: string[];
}

function inspect(table: string, id: string, pattern: string): Finding | null {
  const reasons: string[] = [];
  if (INVERTED_CLASS.test(pattern)) reasons.push('inverted character class (\\D/\\S/\\W/\\B)');
  if (GUTTED_QUANTIFIER.test(pattern)) reasons.push('quantifier with stripped bounds ({,})');
  if (pattern === pattern.toUpperCase() && /[A-Z]/.test(pattern)) {
    reasons.push('all-uppercase — consistent with having been normalized');
  }
  if (!/\d/.test(pattern) && /\{|\+|\*/.test(pattern)) {
    reasons.push('quantified but digit-free — digits may have been stripped');
  }
  if (!pattern.includes('.')) reasons.push('no `.` wildcard — one may have been deleted');
  try {
    new RegExp(pattern, 'i');
  } catch {
    reasons.push('DOES NOT COMPILE — this rule can never fire');
  }
  return reasons.length > 0 ? { table, id, pattern, reasons } : null;
}

function main(): void {
  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const corrections = opened.db
      .select({ id: transactionCorrections.id, pattern: transactionCorrections.descriptionPattern })
      .from(transactionCorrections)
      .where(eq(transactionCorrections.matchType, 'regex'))
      .all();
    const tagRules = opened.db
      .select({ id: transactionTagRules.id, pattern: transactionTagRules.descriptionPattern })
      .from(transactionTagRules)
      .where(eq(transactionTagRules.matchType, 'regex'))
      .all();

    const findings = [
      ...corrections.map((r) => inspect('transaction_corrections', r.id, r.pattern)),
      ...tagRules.map((r) => inspect('transaction_tag_rules', r.id, r.pattern)),
    ].filter((f): f is Finding => f !== null);

    console.warn(
      `regex rules scanned: ${corrections.length} correction(s), ${tagRules.length} tag rule(s)`
    );
    console.warn(`suspect rows: ${findings.length}`);
    for (const f of findings) {
      console.warn(`\n  ${f.table} ${f.id}`);
      console.warn(`    pattern: ${f.pattern}`);
      for (const reason of f.reasons) console.warn(`    - ${reason}`);
    }
    if (findings.length > 0) {
      console.warn('\nThese cannot be repaired automatically — re-author them by hand.');
    }
  } finally {
    opened.raw.close();
  }
}

main();
