import {
  derivePatternFromDescriptions,
  type ConfirmedTransaction,
  type TagRuleChangeSet,
} from '@pops/finance';

import { parseTag } from '../../../lib/tags';

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

function commonTagsForGroup(group: EntityGroup): string[] {
  const counts = new Map<string, number>();
  for (const txn of group.txns) {
    for (const tag of new Set(txn.tags ?? [])) {
      if (EPISODIC_TAG_FACETS.has(parseTag(tag).facet ?? '')) continue;
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
 * Tag rules worth proposing for a confirmed import batch — one per entity
 * group that carries common tags and yields a usable descriptor pattern.
 *
 * `entityName` stays the proposal's label; `pattern` is what the rule will
 * match on, and the two are deliberately different things.
 */
export function computeProposals(confirmedTransactions: ConfirmedTransaction[]): RuleProposal[] {
  const proposals: RuleProposal[] = [];
  let seq = 0;
  for (const [, group] of groupByEntity(confirmedTransactions)) {
    const tags = commonTagsForGroup(group);
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
    source: 'import-batch',
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
