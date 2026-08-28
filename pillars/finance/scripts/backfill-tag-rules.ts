import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
/**
 * Reviewed one-off backfill of tag rules for the repeated merchants that came
 * out of the 2026-08-28 namespace migration under-tagged (POPS-2607).
 *
 * The gap is dominated by merchants, not by transactions: 166 descriptors carry
 * a missing facet, and the ones worth a rule are the ones that repeat. Each
 * rule asserts the full facet set the descriptor justifies rather than one tag,
 * then `applyTagRuleToExistingTransactions` walks the ledger and merges it into
 * every row it matches — additively, so it only ever adds a value the row was
 * missing and never overwrites one it already carries. It does not skip rows a
 * human marked `manual`: that marker records a classification fix, not curated
 * tags, and skipping on it cost 23 of 106 matched rows here (POPS-2662).
 *
 * A rule that would put a second value on a single-valued facet — asserting
 * `venue:supermarket` over a row already reading `venue:cafe` — has that value
 * refused by the applier itself, so no run of this script can produce a
 * two-venue row. What the applier cannot do is tell the author of these rules
 * that a merchant they thought was settled is not: `findTagRuleConflicts`
 * reports those rows up front, because a rule whose venue is silently dropped
 * on some of its matches is a rule that needs rewriting, not re-running.
 *
 * Patterns are digit-free because the digits carry nothing: for `contains`,
 * `normalizeDescription` strips them from the pattern as well as from the
 * descriptor, so `WOOLWORTHS 1034` and `WOOLWORTHS` are the same rule written
 * two ways. (POPS-2622's dead-pattern trap is `regex` only — there the pattern
 * is not normalized, so digits in it match a descriptor that no longer has
 * any. None of these rules are regex.)
 *
 * DRY RUN by default: prints every rule it would create and how many rows each
 * would touch. Pass `--apply` to write. Per the finance-audit remediation
 * policy, TAKE A VERIFIED DB SNAPSHOT FIRST. Idempotent — rule creation
 * reinforces an existing identical rule instead of duplicating it, and the
 * retroactive apply skips a row that already carries every tag.
 *
 *   pnpm --filter @pops/finance exec tsx scripts/backfill-tag-rules.ts
 *   ... scripts/backfill-tag-rules.ts --apply
 *
 * Deliberately NOT covered here, because the ledger does not decide them and a
 * rule would assert a guess on every future import:
 *
 * - the transport and toll merchants (`TFNSW OPAL FARE`, `TRANSPORTFORNSW`,
 *   `E-TOLL`, `AMPOL`) — getting somewhere has no occasion of its own, so the
 *   coverage measurement excludes them instead of a rule guessing one
 */
import {
  applyTagRuleToExistingTransactions,
  type TagRuleRetroactiveResult,
} from '../src/api/modules/tag-rules/retroactive-apply.js';
import { openFinanceDb, transactionTagRulesService, transactions } from '../src/db/index.js';
import { findTagRuleConflicts, type TagRuleConflict } from './tag-rule-conflicts.js';

const LOG = '[backfill-tag-rules]';

interface PlannedRule {
  /** Digit-free substring of the descriptor — see the note above. */
  pattern: string;
  tags: string[];
  /** Why this merchant justifies these values, for the reviewer of this file. */
  why: string;
}

/**
 * The merchants the ledger decides. Grocery runs are `occasion:home` — the food
 * is consumed there, which is what separates them from eating out. Somewhere
 * you sit down or drink at is `occasion:out`. A subscription is billed to the
 * household, so it is `home` unless the thing subscribed to is a work tool.
 */
const RULES: readonly PlannedRule[] = [
  {
    pattern: 'WOOLWORTHS',
    tags: ['occasion:home', 'venue:supermarket'],
    why: 'grocery run; the food is consumed at home',
  },
  {
    pattern: 'WW METRO',
    tags: ['occasion:home', 'venue:supermarket'],
    why: 'the same chain’s small-format store',
  },
  {
    pattern: 'HARRIS FARM MARKETS',
    tags: ['occasion:home', 'venue:supermarket'],
    why: 'grocery run',
  },
  {
    pattern: 'ROMEO.S FOODHALL IGA',
    tags: ['occasion:home', 'venue:supermarket'],
    why: 'grocery run',
  },
  {
    pattern: 'COLES PORT DOUGLAS',
    tags: ['occasion:travel', 'venue:supermarket'],
    why: 'groceries, but 2000km from home — the Sydney Coles rows stay separate',
  },
  {
    pattern: 'PRICELINE PHARMACY',
    tags: ['occasion:home'],
    why: 'household provisioning, same reasoning as the grocery runs',
  },
  {
    pattern: 'PALMS ON OXFORD',
    tags: ['occasion:out', 'contains:alcohol'],
    why: 'a bar; two of its rows already say occasion:out',
  },
  {
    pattern: 'ARQ NIGHTCLUB',
    tags: ['occasion:out', 'contains:alcohol'],
    why: 'a nightclub, already venue:club',
  },
  {
    pattern: 'ALL GOOD STORIES END',
    tags: ['occasion:out'],
    why: 'already venue:bar + contains:events + contains:alcohol',
  },
  {
    pattern: 'HUNGRY JACKS',
    tags: ['occasion:out', 'venue:takeaway'],
    why: 'counter-service fast food, already contains:fast-food',
  },
  {
    pattern: 'YO-CHI',
    tags: ['occasion:out', 'contains:ice-cream', 'venue:takeaway'],
    why: 'frozen yoghurt counter; two of its four rows already say ice-cream',
  },
  {
    pattern: 'THE WOOD ROASTER',
    tags: ['occasion:out', 'venue:cafe'],
    why: 'a cafe, already contains:coffee',
  },
  {
    pattern: 'HOYTS',
    tags: ['occasion:out', 'contains:events'],
    why: 'cinema tickets, already venue:cinema',
  },
  {
    pattern: 'STRIKE AUSTRALIA',
    tags: ['occasion:out', 'contains:events'],
    why: 'bowling and arcade, already venue:arcade',
  },
  {
    pattern: 'GOOGLE *YOUTUBEPREMIUM',
    tags: ['occasion:home'],
    why: 'a household subscription, already contains:subscription',
  },
  {
    pattern: 'NANONOBLE',
    tags: ['occasion:work'],
    why: 'a software subscription; two of its three rows already say work',
  },
  {
    pattern: 'TEMPLE & WEBSTER',
    tags: ['contains:household'],
    why: 'homewares retailer; already occasion:home, missing only what it contains',
  },
  // The two Amazon descriptors carry no facets at all, while 64 other rows in
  // the ledger already carry `enrich:amazon`. What is missing is the marker,
  // not a guess at the contents: the merchant does not determine what was
  // bought, which is the whole reason the `enrich:` facet exists. Marking them
  // takes them out of the addressable set rather than filling it with noise.
  {
    pattern: 'AMAZON MARKETPLACE',
    tags: ['enrich:amazon'],
    why: 'the marker 64 sibling rows already carry; contents come from a receipt, not the descriptor',
  },
  {
    pattern: 'AMAZON RETA',
    tags: ['enrich:amazon'],
    why: 'the same merchant under its retail descriptor',
  },
];

function reportConflicts(conflicts: readonly TagRuleConflict[]): void {
  console.warn(`\n${LOG} ${conflicts.length} single-valued-facet conflict(s):`);
  for (const conflict of conflicts) {
    console.warn(
      `  ${conflict.pattern.padEnd(24)} would add ${conflict.incoming} to a row already ` +
        `carrying ${conflict.existing} — ${conflict.description}`
    );
  }
  console.warn(
    `${LOG} the applier will refuse the clashing value on these rows, so the run is safe — ` +
      'but they will not get the tag the rule intends until the row or the rule is fixed'
  );
}

function reportRule(rule: PlannedRule, ruleId: string, result: TagRuleRetroactiveResult): void {
  console.warn(
    `  ${rule.pattern.padEnd(24)} [${rule.tags.join(', ')}] — ` +
      `${result.updated} row(s) to update of ${result.matched} matched` +
      `  (rule ${ruleId.slice(0, 8)})`
  );
  console.warn(`  ${' '.repeat(24)} ${rule.why}`);
}

function main(): void {
  const apply = process.argv.includes('--apply');

  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    console.warn(`${LOG} ${RULES.length} rule(s)${apply ? '' : ' — DRY RUN'}\n`);

    const conflicts = findTagRuleConflicts(
      RULES,
      opened.db
        .select({ description: transactions.description, tags: transactions.tags })
        .from(transactions)
        .all()
    );
    if (conflicts.length > 0) {
      reportConflicts(conflicts);
    }

    let totalUpdated = 0;
    for (const rule of RULES) {
      const created = transactionTagRulesService.createTransactionTagRule(opened.db, {
        descriptionPattern: rule.pattern,
        matchType: 'contains',
        tags: rule.tags,
      });
      const result = applyTagRuleToExistingTransactions(opened.db, created.id, { dryRun: !apply });
      reportRule(rule, created.id, result);
      totalUpdated += result.updated;
    }

    console.warn(`\n${LOG} ${totalUpdated} row(s) ${apply ? 'updated' : 'would be updated'}`);
    if (!apply) {
      console.warn(
        `${LOG} DRY RUN — the rules above were still created (creation is idempotent); ` +
          're-run with --apply to write the rows (take a snapshot first)'
      );
    }
    console.warn(`${LOG} re-run scripts/audit-tag-coverage.ts to record the new coverage`);
  } finally {
    opened.raw.close();
  }
}

main();
