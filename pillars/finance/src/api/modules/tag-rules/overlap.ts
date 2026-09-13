/**
 * Which active tag rules overlap in the ledger — the server half of POPS-3691,
 * shown beside POPS-2941's ledger match status in the Tag Rules browser.
 *
 * Two rules overlap when both fire on the same transaction. That is harmless
 * on its own; it matters in two shapes:
 *
 * - **contradicts** — the other rule writes a different value on a
 *   single-valued facet this rule also writes. The suggester keeps only one
 *   value per such facet, decided by rule order, so one of the two silently
 *   loses on every transaction they share.
 * - **redundant** — the other rule fires on every transaction this one does
 *   and already writes all of this rule's tags, so this rule adds nothing.
 *
 * Firing is decided by `matchTagRules`, the suggester's own matcher, so entity
 * scope, the active flag and every match type mean here exactly what they mean
 * on import. Overlaps are always computed against every active rule, never
 * just the page being listed: the rule a listed one contradicts is usually on
 * another page. Cost is one `transactions` fetch and one matcher pass per row
 * per request.
 */
import { type FinanceDb, transactionTagRulesService } from '../../../db/index.js';
import { transactions } from '../../../db/schema.js';
import { exceedsFacetCardinality } from '../../../db/tag-facets.js';
import { matchTagRules } from '../tag-suggester/tag-rule-matching.js';
import { type TagRule, toTagRule } from './service.js';

/** How two rules overlap — see this module's header. */
export type TagRuleOverlapKind = 'contradicts' | 'redundant';

/** Another active rule a rule overlaps with, named so the browser can say which. */
export interface TagRuleOverlap {
  ruleId: string;
  descriptionPattern: string;
  kind: TagRuleOverlapKind;
}

function firingRows(db: FinanceDb, activeRules: readonly TagRule[]): Map<string, Set<number>> {
  const ledger = db
    .select({ description: transactions.description, entityId: transactions.entityId })
    .from(transactions)
    .all();
  const byRule = new Map(activeRules.map((rule) => [rule.id, new Set<number>()]));
  ledger.forEach((row, index) => {
    for (const rule of matchTagRules(activeRules, row.description, row.entityId)) {
      byRule.get(rule.id)?.add(index);
    }
  });
  return byRule;
}

function intersects(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  for (const row of a) if (b.has(row)) return true;
  return false;
}

function isWithin(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  for (const row of a) if (!b.has(row)) return false;
  return true;
}

function overlapKind(
  rule: TagRule,
  rows: ReadonlySet<number>,
  other: TagRule,
  otherRows: ReadonlySet<number>
): TagRuleOverlapKind | null {
  if (!intersects(rows, otherRows)) return null;
  if (other.tags.some((tag) => exceedsFacetCardinality(rule.tags, tag))) return 'contradicts';
  const coversTags = rule.tags.every((tag) => other.tags.includes(tag));
  if (coversTags && isWithin(rows, otherRows)) return 'redundant';
  return null;
}

/**
 * Every overlap between each rule in `rules` and the other active rules, keyed
 * by rule id, contradictions first. A disabled rule fires on nothing, so it
 * overlaps with nothing and nothing overlaps with it.
 */
export function findTagRuleOverlaps(
  db: FinanceDb,
  rules: readonly TagRule[]
): Map<string, TagRuleOverlap[]> {
  const active = transactionTagRulesService
    .listTransactionTagRules(db)
    .map(toTagRule)
    .filter((rule) => rule.isActive);
  const rowsByRule = firingRows(db, active);
  const noRows = new Set<number>();
  const result = new Map<string, TagRuleOverlap[]>();
  for (const rule of rules) {
    const rows = rowsByRule.get(rule.id) ?? noRows;
    const overlaps: TagRuleOverlap[] = [];
    for (const other of active) {
      if (other.id === rule.id) continue;
      const kind = overlapKind(rule, rows, other, rowsByRule.get(other.id) ?? noRows);
      if (kind !== null) {
        overlaps.push({ ruleId: other.id, descriptionPattern: other.descriptionPattern, kind });
      }
    }
    result.set(
      rule.id,
      overlaps.toSorted(
        (a, b) =>
          a.kind.localeCompare(b.kind) || a.descriptionPattern.localeCompare(b.descriptionPattern)
      )
    );
  }
  return result;
}
