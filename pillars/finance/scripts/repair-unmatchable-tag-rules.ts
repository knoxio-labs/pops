/**
 * Repair pass for tag rules whose pattern can never match their own merchant
 * (POPS-2940).
 *
 * POPS-2758 fixed the *proposal* path: an import-proposed rule now takes its
 * pattern from the longest common substring of the group's bank descriptors
 * rather than from the entity name. The rules already stored under the old
 * derivation are untouched by that fix, and every one of them is silent —
 * stored, listed, counted in `rulesApplied` and rendered in the Tag Rules
 * browser exactly like a working rule. `times_applied = 0` is the only tell,
 * and it is indistinguishable from "correct but not yet matched".
 *
 * This re-derives each broken rule's pattern from that merchant's own stored
 * descriptors, through the same {@link derivePatternFromDescriptions} the
 * proposal path uses — reused rather than reimplemented, because two
 * derivations would drift and the drift would be invisible: both sides would
 * keep minting plausible-looking rules.
 *
 *   pnpm --filter @pops/finance exec tsx scripts/repair-unmatchable-tag-rules.ts
 *   pnpm --filter @pops/finance exec tsx scripts/repair-unmatchable-tag-rules.ts --write
 *
 * DRY BY DEFAULT. Without `--write` nothing is written and the report is the
 * whole output. Read `docs/runbooks/pillar-go-live.md` before the write pass,
 * and take a litestream-backed copy first — this rewrites operator data that
 * cannot be re-derived from anywhere else.
 *
 * Exits 0 whether or not anything is found; this reports, it does not gate.
 */
import { pathToFileURL } from 'node:url';

import { eq } from 'drizzle-orm';

import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import {
  derivePatternFromDescriptions,
  longestCommonSubstring,
  MIN_DERIVED_PATTERN_LENGTH,
  normalizeDescription,
  patternMatchesDescription,
  describeForMatching,
  type PatternMatchType,
} from '../src/contract/index.js';
import { openFinanceDb, transactions, transactionTagRules } from '../src/db/index.js';

/** The subject of one repair decision — a stored rule plus its merchant's descriptors. */
export interface RuleUnderRepair {
  id: string;
  pattern: string;
  matchType: PatternMatchType;
  entityId: string | null;
  /** Every `transactions.description` stored against this rule's entity. */
  descriptions: string[];
}

/** The drizzle handle this pass reads and writes through. */
type FinanceRepairDb = ReturnType<typeof openFinanceDb>['db'];

export type RepairPlan =
  /** Fires on at least one of its merchant's rows. Nothing to do. */
  | { action: 'ok' }
  /** No entity to scope to, so there is no descriptor set to re-derive from. */
  | { action: 'unscoped' }
  /** The merchant has no stored transactions yet — unused, not broken. */
  | { action: 'unused' }
  /**
   * A `regex` rule that does not currently fire. Left alone entirely.
   *
   * POPS-2758's defect is a pattern derived from an entity *name*, which only
   * an `exact`/`contains` rule can carry — a regex was hand-written, and a
   * regex that matches nothing today is as likely to be deliberately narrow
   * as broken. Worse, every tool this pass has for judging one destroys it:
   * `normalizeDescription` uppercases metacharacters (`\d` -> `\D`), strips
   * digits out of quantifiers (`a{2,3}` -> `a{,}`) and deletes `.`, which is
   * exactly why {@link normalizePatternForStorage} stores a regex verbatim.
   * Run over a regex it still leaves the merchant's name intact, so the
   * mis-assignment guard would pass and the rule would be rewritten into a
   * `contains` pattern — silently replacing an author's regex with something
   * they never wrote.
   */
  | { action: 'regex' }
  /**
   * The rule's own pattern shares nothing with its merchant's descriptors,
   * which is entity mis-assignment rather than a bad derivation. Re-deriving
   * would silently repoint the rule at a merchant its author never meant.
   */
  | { action: 'review'; reason: string }
  /**
   * Re-derived from the merchant's own descriptors. The caller also forces
   * `matchType` to `contains`: the derived pattern is by construction a
   * *substring* of the descriptors, so leaving an `exact` rule as `exact`
   * would repair the pattern into one that still never fires.
   */
  | { action: 'repair'; from: string; to: string }
  | { action: 'disable'; from: string; reason: string };

function matchesOwnMerchant(rule: RuleUnderRepair): boolean {
  return rule.descriptions.some((description) =>
    patternMatchesDescription(rule.pattern, rule.matchType, describeForMatching(description))
  );
}

/**
 * Does this rule's pattern look like it belongs to this merchant at all?
 *
 * A bad derivation still leaves the two overlapping — `CORRIDOR DIGITAL`
 * against `CORRIDORDIGITAL`, `IMPERIAL HOTEL ERSKINEVILLE` against
 * `IMPERIAL HOTEL ERSKIN 2 ERSKINEVILLE` — because the pattern came from the
 * merchant's name and the descriptor is the same merchant, spelled the way
 * the bank sends it. Mis-assignment leaves no overlap at all: `ANZ` against
 * `PAYMENT THANKYOU`, `EUROVISION` against `VOTINGPARTNER ONCENET`,
 * `ARCHIE BROTHERS` against `STRIKE AUSTRALIA PTY LT`.
 *
 * Measured as the longest common substring against the same threshold a
 * derived pattern has to clear, so the test and the fix agree about what
 * counts as a meaningful run of characters.
 */
function sharesGroundWithMerchant(rule: RuleUnderRepair): boolean {
  const pattern = normalizeDescription(rule.pattern);
  return rule.descriptions.some(
    (description) =>
      longestCommonSubstring([pattern, normalizeDescription(description)]).length >=
      MIN_DERIVED_PATTERN_LENGTH
  );
}

/**
 * How much of the shortest descriptor a derived pattern has to cover.
 *
 * `MIN_DERIVED_PATTERN_LENGTH` is a floor on absolute length, and it is not
 * enough here. Transport for NSW's two stored descriptors are
 * `TRANSPORTFORNSWTRAVEL   SYDNEY` and `TFNSW OPAL FARE \\       SYDNEY`: their
 * longest common substring is ` SYDNEY`, which clears the floor and would be
 * stored as a rule tagging every Sydney merchant in the ledger. The two
 * descriptors are the same merchant, but they share only the suburb.
 *
 * A proposal survives that because a human confirms it in the import wizard
 * before it is stored. A repair pass has nobody, so it refuses instead — the
 * rule is disabled and left for hand re-authoring, which is the same
 * direction the length floor already chose: a missing rule is visible, an
 * over-broad one silently mislabels the ledger.
 */
const MIN_DESCRIPTOR_COVERAGE = 0.4;

function isSpecificEnough(derived: string, descriptions: string[]): boolean {
  const shortest = Math.min(...descriptions.map((d) => normalizeDescription(d).length));
  return shortest === 0 ? false : derived.length / shortest >= MIN_DESCRIPTOR_COVERAGE;
}

/**
 * What to do with one stored rule. Pure — the caller supplies the merchant's
 * descriptors and applies the verdict, so every branch is reachable from a
 * test without a database.
 */
export function planRuleRepair(rule: RuleUnderRepair): RepairPlan {
  if (rule.entityId === null) return { action: 'unscoped' };
  if (rule.descriptions.length === 0) return { action: 'unused' };
  if (matchesOwnMerchant(rule)) return { action: 'ok' };
  if (rule.matchType === 'regex') return { action: 'regex' };

  if (!sharesGroundWithMerchant(rule)) {
    return {
      action: 'review',
      reason: "pattern shares no run of characters with any of the merchant's descriptors",
    };
  }

  const derived = derivePatternFromDescriptions(rule.descriptions);
  if (derived === null) {
    return {
      action: 'disable',
      from: rule.pattern,
      reason: 'no descriptor pattern long enough to be specific',
    };
  }
  if (!isSpecificEnough(derived, rule.descriptions)) {
    return {
      action: 'disable',
      from: rule.pattern,
      reason: `derived pattern "${derived}" covers too little of the merchant's descriptors to be specific`,
    };
  }
  return { action: 'repair', from: rule.pattern, to: derived };
}

/** How many rows each verdict actually touched. */
export interface RepairsApplied {
  repaired: number;
  disabled: number;
}

/**
 * Apply the verdicts. Separate from {@link main} so the destructive half is
 * reachable from a test against a migrated database rather than only from a
 * run against prod.
 *
 * A repaired rule is also forced to `contains`. The derived pattern is a
 * substring of the merchant's descriptors by construction, so an `exact` rule
 * left as `exact` would come out of the repair still unable to fire — the
 * exact bug the pass exists to clear.
 */
export function applyRepairs(
  db: FinanceRepairDb,
  planned: readonly { rule: RuleUnderRepair; plan: RepairPlan }[]
): RepairsApplied {
  let repaired = 0;
  let disabled = 0;
  db.transaction((tx) => {
    for (const { rule, plan } of planned) {
      if (plan.action === 'repair') {
        tx.update(transactionTagRules)
          .set({ descriptionPattern: plan.to, matchType: 'contains' })
          .where(eq(transactionTagRules.id, rule.id))
          .run();
        repaired += 1;
      } else if (plan.action === 'disable') {
        tx.update(transactionTagRules)
          .set({ isActive: false })
          .where(eq(transactionTagRules.id, rule.id))
          .run();
        disabled += 1;
      }
    }
  });
  return { repaired, disabled };
}

function loadRules(db: FinanceRepairDb): RuleUnderRepair[] {
  const rules = db
    .select({
      id: transactionTagRules.id,
      pattern: transactionTagRules.descriptionPattern,
      matchType: transactionTagRules.matchType,
      entityId: transactionTagRules.entityId,
    })
    .from(transactionTagRules)
    .all();

  const rows = db
    .select({ entityId: transactions.entityId, description: transactions.description })
    .from(transactions)
    .all();

  const byEntity = new Map<string, string[]>();
  for (const row of rows) {
    if (row.entityId === null) continue;
    const existing = byEntity.get(row.entityId);
    if (existing) existing.push(row.description);
    else byEntity.set(row.entityId, [row.description]);
  }

  return rules.map((rule) => ({
    ...rule,
    descriptions: rule.entityId === null ? [] : (byEntity.get(rule.entityId) ?? []),
  }));
}

function main(): void {
  const write = process.argv.includes('--write');
  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const rules = loadRules(opened.db);
    const planned = rules.map((rule) => ({ rule, plan: planRuleRepair(rule) }));
    const counts = new Map<string, number>();
    for (const { plan } of planned) counts.set(plan.action, (counts.get(plan.action) ?? 0) + 1);

    console.warn(`tag rules scanned: ${rules.length}`);
    for (const action of ['ok', 'repair', 'disable', 'review', 'regex', 'unused', 'unscoped']) {
      console.warn(`  ${action}: ${counts.get(action) ?? 0}`);
    }

    for (const { rule, plan } of planned) {
      if (plan.action === 'repair') {
        console.warn(`\n  REPAIR ${rule.id}`);
        console.warn(`    from: ${plan.from}`);
        console.warn(`      to: ${plan.to}`);
      } else if (plan.action === 'disable') {
        console.warn(`\n  DISABLE ${rule.id}`);
        console.warn(`    pattern: ${plan.from}`);
        console.warn(`    reason:  ${plan.reason}`);
      } else if (plan.action === 'review') {
        console.warn(`\n  REVIEW ${rule.id} (left alone)`);
        console.warn(`    pattern:     ${rule.pattern}`);
        console.warn(`    descriptors: ${[...new Set(rule.descriptions)].slice(0, 3).join(' | ')}`);
        console.warn(`    reason:      ${plan.reason}`);
      }
    }

    if (!write) {
      console.warn('\nDry run — nothing written. Re-run with --write to apply.');
      return;
    }

    const written = applyRepairs(opened.db, planned);
    console.warn(`\nWrote: ${written.repaired} repaired, ${written.disabled} disabled.`);
  } finally {
    opened.raw.close();
  }
}

/** True only when this file is the process entry point, not when a test imports it. */
function isDirectRun(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  return import.meta.url === pathToFileURL(entry).href;
}

if (isDirectRun()) {
  try {
    main();
  } catch (err: unknown) {
    console.error(
      '[repair-unmatchable-tag-rules] FAILED:',
      err instanceof Error ? err.message : err
    );
    process.exitCode = 1;
  }
}
