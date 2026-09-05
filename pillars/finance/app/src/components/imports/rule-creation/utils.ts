import {
  describeForMatching,
  normalizeDescription,
  patternMatchesDescription,
  type ConfirmedTransaction,
  type TagRuleChangeSet,
} from '@pops/finance';

export interface RuleProposal {
  id: string;
  entityId: string | null;
  entityName: string;
  pattern: string;
  tags: string[];
  affectsCount: number;
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

function commonTagsForGroup(group: EntityGroup): string[] {
  const counts = new Map<string, number>();
  for (const txn of group.txns) {
    for (const tag of new Set(txn.tags ?? [])) {
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
 * The shortest derived pattern worth storing as a `contains` rule.
 *
 * The longest common substring of two descriptors that share no merchant is
 * a fragment of a word — `RATTLE N HUM` and `MICROSOFT*STORE` have `S` in
 * common — and a rule on a fragment tags everything. Below this length the
 * group is treated as having no usable pattern and no rule is proposed at
 * all, which is the safe direction: a missing rule is visible on the next
 * import, an over-broad one silently mislabels the whole ledger.
 */
const MIN_PATTERN_LENGTH = 4;

/**
 * The longest string contained in every one of `values`, or `''`.
 *
 * Scans the substrings of the shortest input from longest to shortest, so the
 * first candidate every other value contains is by definition the longest.
 * Descriptors are bank-statement length and a group is one merchant's rows,
 * so the cubic worst case is never approached in practice.
 */
function longestCommonSubstring(values: string[]): string {
  const [shortest, ...rest] = values.toSorted((a, b) => a.length - b.length);
  if (shortest === undefined) return '';
  for (let length = shortest.length; length > 0; length--) {
    for (let start = 0; start + length <= shortest.length; start++) {
      const candidate = shortest.slice(start, start + length);
      if (rest.every((value) => value.includes(candidate))) return candidate;
    }
  }
  return '';
}

/**
 * The `contains` pattern for a group, derived from the descriptions the group
 * was built from — never from the entity name.
 *
 * An entity name is a tidy label a human or the matcher chose; the descriptor
 * is what the bank actually sent, and the two routinely fail to line up under
 * {@link normalizeDescription}, which inserts no word boundaries and strips
 * neither `*` nor a bank's mid-word truncation. `MICROSOFT STORE` is not
 * contained in `MICROSOFT*STORE`, and `RATTLE N HUM BAR GRILL` is longer than
 * the `RATTLE N HUM BAR GRI` it would have to be contained in, so both stored
 * as rules that could never fire (POPS-2758).
 *
 * Taking the longest common substring of the group's own normalised
 * descriptors makes a match against every source row true by construction:
 * one row yields that row's whole descriptor, several yield the part they
 * share. Returns `null` when no pattern long enough to be specific survives.
 */
function derivePattern(group: EntityGroup): string | null {
  const pattern = longestCommonSubstring(
    group.txns.map((txn) => normalizeDescription(txn.description))
  ).trim();
  if (pattern.length < MIN_PATTERN_LENGTH) return null;

  // Construction guarantees this; running the real predicate is what keeps the
  // guarantee honest if normalisation ever changes under us. A proposal that
  // matches none of its own source rows is exactly the bug, so it is dropped
  // rather than offered.
  const matchesOwnRows = group.txns.some((txn) =>
    patternMatchesDescription(pattern, 'contains', describeForMatching(txn.description))
  );
  return matchesOwnRows ? pattern : null;
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
