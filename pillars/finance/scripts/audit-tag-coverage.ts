/**
 * Read-only audit of tag *completeness* across the ledger (POPS-2607).
 *
 * The 2026-08-28 namespace migration made every stored tag correct without
 * making it complete: 68% of transactions came out of it carrying no
 * `occasion:` at all. A missing facet is indistinguishable from a negative one
 * in a query, so every figure the taxonomy produces is a floor until the gap is
 * closed — and the only way to know it stayed closed after the next import is
 * to re-run this.
 *
 * Prints per-facet coverage, the stored cardinality violations, any tag outside
 * the active vocabulary, the tags-per-transaction histogram, and the repeated
 * descriptors that still have a gap — that last list is the tag-rule worklist,
 * highest-frequency first, because the under-tagged rows are dominated by
 * merchants that want a rule each rather than a decision each.
 *
 *   pnpm --filter @pops/finance exec tsx scripts/audit-tag-coverage.ts
 *   ... scripts/audit-tag-coverage.ts --json > coverage-before.json
 *   ... scripts/audit-tag-coverage.ts --strict   # exit 1 while criteria are unmet
 *
 * Writes nothing. Exits 0 by default whether or not gaps are found — this
 * reports. `--strict` makes it gate, for use once the pass is complete.
 */
import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import { openFinanceDb, tagCoverageService, tagVocabularyService } from '../src/db/index.js';

import type { TagCoverage } from '../src/db/index.js';

const LOG = '[audit-tag-coverage]';
/** Descriptors printed in the worklist; the tail past this earns no rule. */
const WORKLIST_LIMIT = 25;

function percent(part: number, whole: number): string {
  if (whole === 0) return 'n/a';
  return `${Math.round((part / whole) * 100)}%`;
}

function reportFacets(coverage: TagCoverage): void {
  console.warn(`${LOG} ${coverage.transactions} transaction(s)\n`);
  console.warn(
    `  ${'facet'.padEnd(10)} ${'required'.padEnd(9)} ${'covered'.padEnd(12)} ` +
      `${'of those'.padEnd(8)} ${'missing'.padEnd(8)} excluded`
  );
  for (const facet of coverage.facets) {
    const excluded = [
      facet.enrichExcluded > 0 ? `${facet.enrichExcluded} enrich` : '',
      facet.nonSpendExcluded > 0 ? `${facet.nonSpendExcluded} non-spend` : '',
      ...facet.excluded.map((entry) =>
        entry.transactions > 0 ? `${entry.transactions} ${entry.reason}` : ''
      ),
    ]
      .filter(Boolean)
      .join(', ');
    console.warn(
      `  ${facet.facet.padEnd(10)} ${(facet.required ? 'yes' : 'no').padEnd(9)} ` +
        `${`${facet.covered}/${facet.addressable}`.padEnd(12)} ` +
        `${percent(facet.covered, facet.addressable).padEnd(8)} ` +
        `${String(facet.missing).padEnd(8)} ${excluded || '—'}`
    );
    if (facet.cardinalityViolations > 0) {
      console.warn(
        `             ^ ${facet.cardinalityViolations} row(s) carry more than one value on a ` +
          'single-valued facet — stored before the write-path constraint (POPS-2606)'
      );
    }
  }
}

function reportHistogram(coverage: TagCoverage): void {
  const line = coverage.tagCountHistogram
    .map((bucket) => `${bucket.tags}:${bucket.transactions}`)
    .join('  ');
  console.warn(`\n${LOG} tags per transaction — ${line}`);
}

function reportVocabulary(coverage: TagCoverage): void {
  if (coverage.outsideVocabulary.length === 0) {
    console.warn(`\n${LOG} every stored tag is in the active vocabulary`);
    return;
  }
  console.warn(
    `\n${LOG} ${coverage.outsideVocabulary.length} tag(s) outside the active vocabulary:`
  );
  for (const usage of coverage.outsideVocabulary) {
    console.warn(`  ${usage.tag} — ${usage.transactions} transaction(s)`);
  }
}

function reportWorklist(coverage: TagCoverage): void {
  if (coverage.gaps.length === 0) {
    console.warn(`\n${LOG} no descriptor is missing a required facet`);
    return;
  }
  const shown = coverage.gaps.slice(0, WORKLIST_LIMIT);
  const remaining = coverage.gaps.length - shown.length;
  console.warn(
    `\n${LOG} ${coverage.gaps.length} descriptor(s) with a gap — highest frequency first:`
  );
  for (const gap of shown) {
    console.warn(
      `  ${String(gap.transactions).padStart(3)}x  ${gap.description}  ` +
        `→ missing ${gap.missingFacets.join(', ')}`
    );
  }
  if (remaining > 0) {
    console.warn(`  … and ${remaining} more, each on fewer transactions — the hand-review tail`);
  }
}

function main(): void {
  const asJson = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');

  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const vocabulary = tagVocabularyService.listVocabularyTags(opened.db);
    const coverage = tagCoverageService.measureTagCoverage(opened.db, vocabulary);
    const complete = tagCoverageService.isCoverageComplete(coverage);

    if (asJson) {
      process.stdout.write(`${JSON.stringify({ complete, coverage }, null, 2)}\n`);
    } else {
      reportFacets(coverage);
      reportHistogram(coverage);
      reportVocabulary(coverage);
      reportWorklist(coverage);
      console.warn(
        `\n${LOG} ${complete ? 'COMPLETE — every criterion met' : 'INCOMPLETE — gaps remain above'}`
      );
    }

    if (strict && !complete) process.exitCode = 1;
  } finally {
    opened.raw.close();
  }
}

main();
