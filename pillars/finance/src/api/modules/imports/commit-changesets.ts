/**
 * The ChangeSet-apply phases of an import commit.
 *
 * Split out of `commit.ts` so that file stays under the per-file line cap.
 * Both run inside the commit's single SQLite transaction, on the handle `tx`
 * threaded in, so their inner service calls nest as savepoints rather than
 * opening transactions of their own.
 */
import { applyChangeSet, dropUnusableAddOps } from '../corrections/index.js';
import { applyTagRuleChangeSet, type TagRuleWriteCounts } from '../tag-rules/service.js';
import { resolveChangeSetTempIds, resolveTagRuleChangeSetTempIds } from './commit-temp-resolver.js';

import type { FinanceDb } from '../../../db/index.js';
import type { CommitPayload } from './types.js';

export interface RuleApplyCounts {
  add: number;
  edit: number;
  disable: number;
  remove: number;
}

/** Created-vs-reinforced split for a commit's correction-rule `add` ops (POPS-2954). */
export interface CorrectionRuleWriteCounts {
  inserted: number;
  reinforced: number;
}

export interface CorrectionChangeSetPhaseResult {
  /** Every correction ChangeSet op applied, by kind — the long-standing total. */
  counts: RuleApplyCounts;
  /** Of the `add` ops, how many minted a rule against how many merged into one. */
  writes: CorrectionRuleWriteCounts;
}

/**
 * Apply the batch's correction ChangeSets, counting created rules apart from
 * reinforced ones.
 *
 * An `add` op that resolves to an existing `(pattern, matchType)` merges into
 * that rule rather than creating one (POPS-2954, mirroring the tag-rule fix
 * in `applyTagRuleChangeSetsPhase` below). Both used to be counted only as
 * `counts.add`, which does not say which ones landed on a rule the batch did
 * not create.
 */
export function applyChangeSetsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): CorrectionChangeSetPhaseResult {
  const counts: RuleApplyCounts = { add: 0, edit: 0, disable: 0, remove: 0 };
  const writes: CorrectionRuleWriteCounts = { inserted: 0, reinforced: 0 };
  for (const cs of payload.changeSets) {
    const resolved = resolveChangeSetTempIds(cs, tempIdMap);
    const sanitized = dropUnusableAddOps(resolved);
    if (sanitized.ops.length === 0) continue;
    const applied = applyChangeSet(tx, sanitized);
    for (const op of sanitized.ops) counts[op.op]++;
    writes.inserted += applied.writes.inserted;
    writes.reinforced += applied.writes.reinforced;
  }
  return { counts, writes };
}

export interface TagRulePhaseResult {
  /** Every tag-rule op applied, of any kind — the long-standing total. */
  applied: number;
  /** Of the `add` ops, how many minted a rule against how many merged into one. */
  writes: TagRuleWriteCounts;
}

/**
 * Apply the batch's tag-rule ChangeSets, counting created rules apart from
 * reinforced ones.
 *
 * An `add` op that resolves to an existing `(pattern, matchType, entityId)`
 * merges into that rule rather than creating one. Both used to be counted as
 * ops applied and nothing else, so `import_commits` recorded a merge into a
 * rule the batch did not create as a rule it did (POPS-2755).
 */
export function applyTagRuleChangeSetsPhase(
  tx: FinanceDb,
  tagRuleChangeSets: CommitPayload['tagRuleChangeSets'],
  tempIdMap: Map<string, string>
): TagRulePhaseResult {
  const result: TagRulePhaseResult = { applied: 0, writes: { inserted: 0, reinforced: 0 } };
  for (const entry of tagRuleChangeSets) {
    const resolved = resolveTagRuleChangeSetTempIds(entry.changeSet, tempIdMap);
    const { writes } = applyTagRuleChangeSet(tx, resolved);
    result.applied += resolved.ops.length;
    result.writes.inserted += writes.inserted;
    result.writes.reinforced += writes.reinforced;
  }
  return result;
}
