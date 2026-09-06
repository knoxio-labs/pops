import type { ConfirmedTransaction, TagRuleChangeSet } from '@pops/finance';

import type { PendingTagRuleChangeSet } from '../store/importStore';

type TagRuleChangeSetOp = TagRuleChangeSet['ops'][number];

/**
 * The tags currently carried by the rows a staged rule was derived from.
 *
 * Read from `confirmedTransactions` at the moment the payload is built, never
 * from a copy taken when the rule was staged — that copy is the thing this
 * module exists to stop trusting.
 */
function currentTagUnion(
  confirmedTransactions: readonly ConfirmedTransaction[],
  sourceChecksums: readonly string[]
): Set<string> {
  const wanted = new Set(sourceChecksums);
  const union = new Set<string>();
  for (const txn of confirmedTransactions) {
    if (!wanted.has(txn.checksum)) continue;
    for (const tag of txn.tags ?? []) union.add(tag);
  }
  return union;
}

/**
 * Returns the op with its tags narrowed to those still live, or `null` when
 * nothing survives — `TagRuleDataSchema.tags` is `min(1)`, so a tagless op is
 * not representable and must be dropped rather than emptied.
 */
function reconcileOp(op: TagRuleChangeSetOp, live: ReadonlySet<string>): TagRuleChangeSetOp | null {
  if (op.op === 'disable' || op.op === 'remove') return op;
  const tags = op.data.tags;
  if (tags === undefined) return op;
  const kept = tags.filter((tag) => live.has(tag));
  if (kept.length === 0) return null;
  if (kept.length === tags.length) return op;
  // Rebuilt per branch: spreading across the union would decouple `op` from
  // the shape of its own `data`.
  return op.op === 'add'
    ? { op: 'add', data: { ...op.data, tags: kept } }
    : { op: 'edit', id: op.id, data: { ...op.data, tags: kept } };
}

/**
 * Re-check one staged tag rule against the current state of the rows it came
 * from, dropping any tag those rows no longer carry.
 *
 * A staged rule materialises its tags when it is staged, but the user goes on
 * editing tags afterwards, and nothing re-visits the staged copy. Without this
 * the two drift: the wizard shows `venue:pub` while the rule still asserts the
 * `venue:bar` it was staged with, and the commit is refused atomically over a
 * value the user removed and has no way to see (POPS-3106).
 *
 * Narrowing only ever removes. A tag the rows do not carry was never confirmed
 * anywhere in this import, so dropping it is the conservative reading; adding
 * tags the user did not put on the rule would be the opposite mistake.
 *
 * `acceptedNewTags` is narrowed with the same set, so a tag dropped from the
 * rule cannot still be upserted into the vocabulary behind it (POPS-2643).
 *
 * Entries with no `sourceChecksums` pass through untouched: they predate this
 * field or were hand-written, and there are no originating rows to check them
 * against. Returns `null` when the whole entry is stale.
 */
export function reconcilePendingTagRule(
  entry: PendingTagRuleChangeSet,
  confirmedTransactions: readonly ConfirmedTransaction[]
): PendingTagRuleChangeSet | null {
  if (entry.sourceChecksums === undefined) return entry;

  const live = currentTagUnion(confirmedTransactions, entry.sourceChecksums);
  const ops = entry.changeSet.ops
    .map((op) => reconcileOp(op, live))
    .filter((op): op is TagRuleChangeSetOp => op !== null);
  if (ops.length === 0) return null;

  const acceptedNewTags = entry.acceptedNewTags?.filter((tag) => live.has(tag));
  const unchanged =
    ops.length === entry.changeSet.ops.length &&
    ops.every((op, i) => op === entry.changeSet.ops[i]) &&
    acceptedNewTags?.length === entry.acceptedNewTags?.length;
  if (unchanged) return entry;

  return {
    ...entry,
    changeSet: { ...entry.changeSet, ops },
    ...(acceptedNewTags ? { acceptedNewTags } : {}),
  };
}

/**
 * The identity a staged rule is deduped on: two entries that would write the
 * same rule are the same staged intent, however many times the user passed
 * through the step that stages it.
 */
export function pendingTagRuleKey(entry: PendingTagRuleChangeSet): string | null {
  const first = entry.changeSet.ops[0];
  if (first === undefined || first.op !== 'add') return null;
  return JSON.stringify([
    first.data.descriptionPattern,
    first.data.matchType,
    first.data.entityId ?? null,
  ]);
}
