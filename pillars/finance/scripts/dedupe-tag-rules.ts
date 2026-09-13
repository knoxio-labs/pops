/**
 * Dedupe pass for active tag rules racing for the same pattern (POPS-3664).
 *
 * `findDuplicateTransactionTagRules` groups active rules by normalized
 * `(descriptionPattern, matchType)`. This splits each of those groups further
 * by `entityId`, because that is the identity key the write path itself uses
 * (`findExistingTagRule`): two rules for the same pattern scoped to two
 * different real entities are two deliberate rules, not a duplicate, and a
 * global rule (`entityId` null) is distinct from every scoped one. Only rows
 * sharing all three are a cluster.
 *
 * Rows scoped to an unresolved `temp:` placeholder are taken out before
 * clustering and deleted: no contact carries such an id, so they can never
 * fire, and they are what gave most prod clusters their extra rows.
 *
 * Within a cluster:
 *
 * - identical tag sets are merged: the survivor is the row with the highest
 *   `times_applied`, then the oldest, then the lowest id; it receives the sum
 *   of `times_applied` and the latest `last_used_at`, and the others are
 *   **deleted**.
 * - disagreeing tag sets are a conflict. Reported, never written, unless the
 *   resolutions file names the tag set to keep for that cluster key.
 *
 * Deleted rather than disabled. `findExistingTagRule` does not filter on
 * `is_active`, so a disabled duplicate still holds the identity key: the next
 * import `add` op for that pattern can land on it and flip it back to active,
 * recreating the duplicate this pass removed.
 *
 * Inactive rules are not considered at all, matching the audit this builds on.
 *
 *   pnpm --filter @pops/finance exec tsx scripts/dedupe-tag-rules.ts
 *   pnpm --filter @pops/finance exec tsx scripts/dedupe-tag-rules.ts --json
 *   pnpm --filter @pops/finance exec tsx scripts/dedupe-tag-rules.ts --resolutions=resolutions.json
 *   pnpm --filter @pops/finance exec tsx scripts/dedupe-tag-rules.ts --resolutions=resolutions.json --write
 *
 * The resolutions file is a JSON object mapping a conflict's cluster key, as
 * printed by a dry run (`matchType|pattern|entityId`, `*` for a global rule),
 * to the tag set to keep:
 *
 *   { "contains|SP SALTIRE ESTATE|6f0c…": ["occasion:home", "venue:bottle-shop"] }
 *
 * A key matching no conflict fails the run before anything is written — it is
 * a typo or a stale key, and silently skipping it would leave the cluster the
 * operator believed they resolved.
 *
 * DRY BY DEFAULT. Take a litestream-backed copy of the finance DB before
 * `--write`: merged and deleted rows cannot be re-derived.
 */
import { readFileSync } from 'node:fs';

import { eq, inArray } from 'drizzle-orm';

import { isCliEntrypoint } from '@pops/pillar-sdk/node';

import { resolveFinanceSqlitePath } from '../src/api/finance-sqlite-path.js';
import {
  openFinanceDb,
  transactionTagRules,
  transactionTagRulesService,
  type FinanceDb,
  type TransactionTagRuleRow,
} from '../src/db/index.js';
import { parseStoredTags } from '../src/db/tag-facets.js';
import {
  parseResolutions,
  planDedupe,
  type Collapse,
  type DedupePlan,
  type DedupeReport,
  type DedupeRule,
  type PatternBucket,
  type Resolutions,
} from './dedupe-tag-rules-plan.js';

/** How many rows {@link applyDedupe} touched. */
export interface DedupeWritten {
  deleted: number;
  merged: number;
  resolved: number;
}

/** A plan, and what applying it wrote — `null` for a dry run or a blocked write. */
export type DedupeRun = DedupeReport & { written: DedupeWritten | null };

/**
 * Apply the plans in one transaction. Separate from {@link main} so the
 * destructive half is reachable from a test against a migrated database.
 * Unresolved conflicts and `ok` plans write nothing.
 */
export function applyDedupe(db: FinanceDb, plans: readonly DedupePlan[]): DedupeWritten {
  const written: DedupeWritten = { deleted: 0, merged: 0, resolved: 0 };
  db.transaction((tx) => {
    const writeCollapse = (plan: Collapse, tags: readonly string[] | null): void => {
      tx.update(transactionTagRules)
        .set({
          timesApplied: plan.timesApplied,
          lastUsedAt: plan.lastUsedAt,
          ...(tags === null ? {} : { tags: JSON.stringify(tags) }),
        })
        .where(eq(transactionTagRules.id, plan.keepId))
        .run();
      if (plan.removeIds.length > 0) {
        tx.delete(transactionTagRules).where(inArray(transactionTagRules.id, plan.removeIds)).run();
        written.deleted += plan.removeIds.length;
      }
    };

    for (const plan of plans) {
      if (plan.kind === 'delete-temp-scope') {
        tx.delete(transactionTagRules).where(eq(transactionTagRules.id, plan.ruleId)).run();
        written.deleted += 1;
      } else if (plan.kind === 'merge') {
        writeCollapse(plan, null);
        written.merged += 1;
      } else if (plan.kind === 'conflict' && plan.resolution !== null) {
        writeCollapse(plan.resolution, plan.resolution.tags);
        written.resolved += 1;
      }
    }
  });
  return written;
}

function toDedupeRule(row: TransactionTagRuleRow): DedupeRule {
  return {
    id: row.id,
    entityId: row.entityId,
    tags: parseStoredTags(row.tags),
    timesApplied: row.timesApplied,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
  };
}

/**
 * Every active rule, bucketed by normalized `(descriptionPattern, matchType)`
 * through `findDuplicateTransactionTagRules`, with each rule that audit leaves
 * out as a bucket of its own — a lone `temp:`-scoped rule still has to be seen
 * to be deleted.
 */
export function loadPatternBuckets(db: FinanceDb): PatternBucket[] {
  const groups = transactionTagRulesService.findDuplicateTransactionTagRules(db);
  const grouped = new Set(groups.flatMap((group) => group.rules.map((rule) => rule.id)));
  const singles = db
    .select()
    .from(transactionTagRules)
    .where(eq(transactionTagRules.isActive, true))
    .all()
    .filter((row) => !grouped.has(row.id));

  return [
    ...groups.map((group) => ({
      descriptionPattern: group.descriptionPattern,
      matchType: group.matchType,
      rules: group.rules.map(toDedupeRule),
    })),
    ...singles.map((row) => ({
      descriptionPattern: row.descriptionPattern,
      matchType: row.matchType,
      rules: [toDedupeRule(row)],
    })),
  ];
}

/** Plan against the database and, when `write` is set and the plan is clean, apply it. */
export function runDedupe(
  db: FinanceDb,
  options: { write: boolean; resolutions: Resolutions }
): DedupeRun {
  const report = planDedupe(loadPatternBuckets(db), options.resolutions);
  if (!options.write || report.unusedResolutionKeys.length > 0) {
    return { ...report, written: null };
  }
  return { ...report, written: applyDedupe(db, report.plans) };
}

function printPlan(plan: DedupePlan): void {
  if (plan.kind === 'delete-temp-scope') {
    console.warn(`\n  DELETE ${plan.ruleId} (${plan.descriptionPattern}, scope ${plan.entityId})`);
  } else if (plan.kind === 'merge') {
    console.warn(`\n  MERGE ${plan.key}`);
    console.warn(`    keep ${plan.keepId}, delete ${plan.removeIds.join(', ')}`);
    console.warn(`    tags ${plan.tags.join(', ')}; times_applied ${plan.timesApplied}`);
  } else if (plan.kind === 'conflict') {
    const suffix = plan.resolution === null ? ' (unresolved)' : '';
    console.warn(`\n  CONFLICT ${plan.key}${suffix}`);
    for (const rule of plan.rules) {
      console.warn(`    ${rule.id} [${rule.tags.join(', ')}] times_applied ${rule.timesApplied}`);
    }
    if (plan.resolution !== null) {
      const { tags, keepId } = plan.resolution;
      console.warn(`    resolved to [${tags.join(', ')}], keep ${keepId}`);
    }
  }
}

function printReport(report: DedupeRun): void {
  const counts = new Map<string, number>();
  for (const plan of report.plans) counts.set(plan.kind, (counts.get(plan.kind) ?? 0) + 1);
  console.warn(`active tag-rule clusters planned: ${report.plans.length}`);
  for (const kind of ['ok', 'delete-temp-scope', 'merge', 'conflict']) {
    console.warn(`  ${kind}: ${counts.get(kind) ?? 0}`);
  }
  for (const plan of report.plans) printPlan(plan);
  for (const key of report.unusedResolutionKeys) {
    console.warn(`\n  UNUSED RESOLUTION ${key} — names no conflict cluster`);
  }
}

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function main(): void {
  const write = process.argv.includes('--write');
  const json = process.argv.includes('--json');
  const resolutionsPath = argValue('resolutions');
  const resolutions =
    resolutionsPath === undefined
      ? new Map<string, string[]>()
      : parseResolutions(JSON.parse(readFileSync(resolutionsPath, 'utf8')));

  const opened = openFinanceDb(resolveFinanceSqlitePath());
  try {
    const report = runDedupe(opened.db, { write, resolutions });
    if (json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    else printReport(report);

    if (report.unusedResolutionKeys.length > 0) {
      console.error('\nResolutions name clusters that are not conflicts; nothing written.');
      process.exitCode = 1;
      return;
    }
    if (report.written === null) {
      console.warn('\nDry run — nothing written. Re-run with --write to apply.');
      return;
    }
    const { deleted, merged, resolved } = report.written;
    console.warn(`\nWrote: ${merged} merged, ${resolved} resolved, ${deleted} rows deleted.`);
  } finally {
    opened.raw.close();
  }
}

if (isCliEntrypoint(import.meta.url)) {
  try {
    main();
  } catch (err: unknown) {
    console.error('[dedupe-tag-rules] FAILED:', err instanceof Error ? err.message : err);
    process.exitCode = 1;
  }
}
