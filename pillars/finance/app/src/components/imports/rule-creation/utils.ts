import {
  derivePatternFromDescriptions,
  type ConfirmedTransaction,
  type TagRuleChangeSet,
} from '@pops/finance';

import { parseTag } from '../../../lib/tags';

import type { PendingTagRuleChangeSet } from '../../../store/import-store-types';

/** The `source` step 6 stages its rules under, and the only staged entries it replaces. */
export const IMPORT_BATCH_SOURCE = 'import-batch';

export interface RuleProposal {
  id: string;
  entityId: string | null;
  entityName: string;
  pattern: string;
  tags: string[];
  affectsCount: number;
  /** The rows `tags` was read from, so a later edit to them can narrow the staged rule (POPS-3106). */
  sourceChecksums: string[];
}

type EntityGroup = { entityId: string | null; entityName: string; txns: ConfirmedTransaction[] };

function groupByEntity(txns: ConfirmedTransaction[]): Map<string, EntityGroup> {
  const groups = new Map<string, EntityGroup>();
  for (const txn of txns) {
    if (!txn.tags?.length) continue;
    const key = txn.entityId ?? `desc:${txn.description.slice(0, 30)}`;
    const name = txn.entityName ?? txn.description.slice(0, 30);
    if (!groups.has(key))
      groups.set(key, { entityId: txn.entityId ?? null, entityName: name, txns: [] });
    groups.get(key)?.txns.push(txn);
  }
  return groups;
}

/**
 * Open-facet axes that name an occasion in the person's life rather than a
 * property of the merchant (POPS-2756). A holiday tag true of every row in an
 * import batch is still true of the trip, not of `HUNGRY JACKS` — the next
 * purchase there happens nowhere near Cairns. Excluded outright, regardless
 * of how consistently they appear within one group, because a batch import
 * has no visibility into whether they would hold on the merchant's next
 * appearance.
 */
const EPISODIC_TAG_FACETS = new Set(['trip', 'project', 'hobby']);

/**
 * Whether the next import puts `tag` back on `txn` with no new rule: a stored
 * rule or the merchant's default tags suggested it here. Proposing a rule for
 * such a tag re-creates something that already exists (POPS-3676).
 */
function suppliedAlready(txn: ConfirmedTransaction, tag: string): boolean {
  return (txn.suggestedTags ?? []).some(
    (suggestion) =>
      suggestion.tag === tag && (suggestion.source === 'rule' || suggestion.source === 'entity')
  );
}

function commonTagsForGroup(group: EntityGroup): string[] {
  const counts = new Map<string, number>();
  for (const txn of group.txns) {
    for (const tag of new Set(txn.tags ?? [])) {
      if (EPISODIC_TAG_FACETS.has(parseTag(tag).facet ?? '')) continue;
      if (suppliedAlready(txn, tag)) continue;
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  const threshold = Math.ceil(group.txns.length * 0.5);
  return [...counts.entries()]
    .filter(([, c]) => c >= threshold)
    .toSorted((a, b) => b[1] - a[1])
    .map(([tag]) => tag);
}

/**
 * The `contains` pattern for a group, derived from the descriptions the group
 * was built from — never from the entity name. See
 * `derivePatternFromDescriptions` for why, and why it lives beside the
 * matcher rather than here.
 */
function derivePattern(group: EntityGroup): string | null {
  return derivePatternFromDescriptions(group.txns.map((txn) => txn.description));
}

/**
 * The tags each row already has a staged rule for, from any step but this
 * one. Step 6's own entries are replaced on every visit rather than subtracted
 * against, or a second visit would hide what the first one staged.
 */
function tagsStagedByRow(staged: readonly PendingTagRuleChangeSet[]): Map<string, Set<string>> {
  const byRow = new Map<string, Set<string>>();
  for (const entry of staged) {
    if (entry.source === IMPORT_BATCH_SOURCE) continue;
    const tags = entry.changeSet.ops.flatMap((op) => (op.op === 'add' ? op.data.tags : []));
    for (const checksum of entry.sourceChecksums ?? []) {
      const rowTags = byRow.get(checksum) ?? new Set<string>();
      for (const tag of tags) rowTags.add(tag);
      byRow.set(checksum, rowTags);
    }
  }
  return byRow;
}

/**
 * Tag rules worth proposing for a confirmed import batch — one per entity
 * group whose common tags nothing already accounts for, and that yields a
 * usable descriptor pattern.
 *
 * Subtracted before anything is proposed (POPS-3676): a tag a stored rule or
 * the merchant's default tags supplied on a row does not count for that row,
 * and a tag a rule `staged` elsewhere in the wizard already covers on every
 * row of the group is dropped. The second is compared by the rows a staged
 * rule came from, never by its pattern, because Tag Review and this step can
 * derive different patterns for the same merchant (POPS-3674).
 *
 * `entityName` stays the proposal's label; `pattern` is what the rule will
 * match on, and the two are deliberately different things.
 */
export function computeProposals(
  confirmedTransactions: ConfirmedTransaction[],
  staged: readonly PendingTagRuleChangeSet[] = []
): RuleProposal[] {
  const stagedByRow = tagsStagedByRow(staged);
  const proposals: RuleProposal[] = [];
  let seq = 0;
  for (const [, group] of groupByEntity(confirmedTransactions)) {
    const tags = commonTagsForGroup(group).filter(
      (tag) => !group.txns.every((txn) => stagedByRow.get(txn.checksum)?.has(tag) ?? false)
    );
    if (!tags.length) continue;
    const pattern = derivePattern(group);
    if (pattern === null) continue;
    proposals.push({
      id: `proposal-${seq++}`,
      entityId: group.entityId,
      entityName: group.entityName,
      pattern,
      tags,
      affectsCount: group.txns.length,
      sourceChecksums: group.txns.map((txn) => txn.checksum),
    });
  }
  return proposals;
}

export function buildChangeSet(p: RuleProposal): TagRuleChangeSet {
  return {
    source: IMPORT_BATCH_SOURCE,
    reason: `Rule detected from import batch for ${p.entityName}`,
    ops: [
      {
        op: 'add',
        data: {
          descriptionPattern: p.pattern,
          matchType: 'contains',
          entityId: p.entityId,
          tags: p.tags,
          confidence: 0.9,
          isActive: true,
        },
      },
    ],
  };
}
