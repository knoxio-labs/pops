import { tagVocabularyService, type FinanceDb } from '../../../db/index.js';
/**
 * Who may add to `tag_vocabulary` at commit time (POPS-2602).
 *
 * The vocabulary used to be complete by accident. Two writers kept it that way
 * and neither was a rule: the tag-rule phase upserted whatever a ChangeSet
 * carried, and a tag typed inline in Tag Review went onto the transaction and
 * nowhere else. Nothing stopped the two drifting apart again, and the obvious
 * repair — upsert every committed tag — would have reinstated the ratchet
 * POPS-2606 removed, promoting a value typed into a closed namespace to
 * permanent vocabulary.
 *
 * So the answer depends on the facet's `kind` (see `src/db/tag-facets.ts`):
 *
 * - **closed** (`venue:` `occasion:` `contains:` `channel:` `fee:`) — the set is
 *   fixed. A value outside it is a validation error at commit, surfaced to the
 *   user, and never upserted. This is the same rule `ai-tag-validation.ts`
 *   applies to the categorizer, now applied to the human too.
 * - **open** (`trip:` `asset:` `project:` `hobby:` `tax:`, and any unprefixed
 *   tag) — a new value is legitimate: a deliberately created trip or asset must
 *   not be lost. It is upserted as part of the commit.
 * - **marker** (`enrich:` `person:` `flag:`) — provenance the system writes.
 *   Admitted, because a contact's `defaultTags` legitimately carries `enrich:`
 *   values onto a transaction, but never upserted from a commit payload: a
 *   marker's standing comes from the system that derived it, not from a payload
 *   asserting it.
 *
 * Scope is the two writers the vocabulary is compared against — the tags going
 * onto `transactions` and the tags going onto `transaction_tag_rules`. Tags
 * carried by a *correction* ChangeSet are deliberately not checked here: a
 * correction's tags only reach storage by being suggested onto a transaction
 * and confirmed, so they meet this same gate one commit later, and validating
 * them here would mean second-guessing `dropUnusableAddOps`, which decides
 * which of those ops apply at all and runs inside the transaction.
 */
import { parseTagFacet, tagFacetKind } from '../../../db/tag-facets.js';
import { ValidationError } from '../../shared/errors.js';
import { collectTagsFromTagRuleChangeSet } from './commit-temp-resolver.js';

import type { KnownTagSet } from '../../../db/services/tag-vocabulary.js';
import type { CommitPayload } from './types.js';

/** The vocabulary writes a commit has been cleared to make. */
export interface CommitTagPlan {
  /** Open-kind tags absent from the vocabulary, to insert as `source: 'user'`. */
  readonly toUpsert: readonly string[];
  /**
   * `payload.tagRuleChangeSets` with every declined tag already removed from
   * each op's `tags` (POPS-2643) — what the commit's tag-rule write phase
   * must apply instead of the raw payload, so a declined tag never reaches
   * `transaction_tag_rules`.
   */
  readonly tagRuleChangeSets: CommitPayload['tagRuleChangeSets'];
}

function trimmedTags(tags: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const tag of tags ?? []) {
    const trimmed = tag.trim();
    if (trimmed !== '') out.push(trimmed);
  }
  return out;
}

/**
 * Filter one staged tag rule's ops down to the tags accept/decline (POPS-2597)
 * actually allows onto the rule.
 *
 * `acceptedNewTags` only ever lists *new* tags — the ones the wizard offered a
 * checkbox for (`isNew: !knownTagSet.has(tag)`, `tag-rules/preview.ts`,
 * `tag-suggester/index.ts`). A tag already in `known` was never subject to the
 * checkbox and always stays; a tag that is new stays only if `accepted` names
 * it. `entry.acceptedNewTags` absent entirely means the flow that staged this
 * rule has no accept/decline UI (batch rule creation), so nothing is declined.
 *
 * A declined tag is dropped from the op's `tags`, not blanked to `''` — it
 * must not reach `transaction_tag_rules` at all (POPS-2643). `add`'s
 * `TagRuleDataSchema.tags` is `.min(1)`, so an `add` op declined down to no
 * tags is dropped outright rather than written as `tags: []`. `edit`'s
 * `TagRuleUpdateSchema.tags` is optional, and an edit op can carry other field
 * changes (`isActive`, `priority`, `confidence`, `entityId`) alongside `tags`
 * in the same `data` — declining every tag on such an op must drop only the
 * `tags` key, not the op, or a user unticking every tag box would silently
 * discard the rest of that edit. An edit left with no fields at all once
 * `tags` is gone is a no-op and is dropped. `disable`/`remove` ops, and an
 * `edit` op that never carried a `tags` array, pass through untouched.
 */
function filterTagRuleChangeSetEntry(
  known: KnownTagSet,
  entry: CommitPayload['tagRuleChangeSets'][number]
): CommitPayload['tagRuleChangeSets'][number] | undefined {
  if (!entry.acceptedNewTags) return entry;
  const accepted = tagVocabularyService.createKnownTagSet(entry.acceptedNewTags);

  const isKept = (tag: string): boolean => known.has(tag) || accepted.has(tag);
  const ops: CommitPayload['tagRuleChangeSets'][number]['changeSet']['ops'] = [];
  for (const op of entry.changeSet.ops) {
    if (op.op === 'add') {
      const keptTags = op.data.tags.filter(isKept);
      if (keptTags.length === 0) continue;
      ops.push({ ...op, data: { ...op.data, tags: keptTags } });
      continue;
    }
    if (op.op === 'edit' && op.data.tags) {
      const keptTags = op.data.tags.filter(isKept);
      if (keptTags.length > 0) {
        ops.push({ ...op, data: { ...op.data, tags: keptTags } });
        continue;
      }
      const { tags: _declinedTags, ...rest } = op.data;
      if (Object.keys(rest).length === 0) continue;
      ops.push({ ...op, data: rest });
      continue;
    }
    ops.push(op);
  }

  if (ops.length === 0) return undefined;
  return { ...entry, changeSet: { ...entry.changeSet, ops } };
}

/** {@link filterTagRuleChangeSetEntry} over every staged tag rule, dropping an
 * entry left with no ops (every op declined down to nothing). */
function filterAcceptedTagRuleChangeSets(
  known: KnownTagSet,
  entries: CommitPayload['tagRuleChangeSets']
): CommitPayload['tagRuleChangeSets'] {
  const filtered: CommitPayload['tagRuleChangeSets'][number][] = [];
  for (const entry of entries) {
    const kept = filterTagRuleChangeSetEntry(known, entry);
    if (kept) filtered.push(kept);
  }
  return filtered;
}

function rejectUnknownClosedValue(tag: string, facet: string): never {
  throw new ValidationError(
    { tag, facet },
    `'${tag}' is not a value of the closed '${facet}' namespace. ` +
      `Pick an existing ${facet} value, or use an open namespace for a value you are creating.`
  );
}

/**
 * Decide what a commit is allowed to write to `tag_vocabulary`, rejecting the
 * whole commit if any tag names a value a closed namespace does not hold.
 *
 * Read-only, and called before the SQLite transaction opens — and before
 * contacts pre-create, which is not covered by that transaction — so a
 * rejected commit writes nothing anywhere.
 */
export function planCommitTagVocabulary(db: FinanceDb, payload: CommitPayload): CommitTagPlan {
  const known = tagVocabularyService.loadKnownTagSet(db);
  const tagRuleChangeSets = filterAcceptedTagRuleChangeSets(known, payload.tagRuleChangeSets);
  const toUpsert = new Map<string, string>();

  const committedTags = [
    ...payload.transactions.flatMap((txn) => trimmedTags(txn.tags)),
    ...tagRuleChangeSets.flatMap((entry) =>
      trimmedTags(collectTagsFromTagRuleChangeSet(entry.changeSet))
    ),
  ];

  for (const tag of committedTags) {
    if (known.has(tag)) continue;
    const { facet } = parseTagFacet(tag);
    const kind = tagFacetKind(facet);
    if (kind === 'closed') rejectUnknownClosedValue(tag, facet ?? '');
    if (kind === 'marker') continue;
    const key = tagVocabularyService.normalizeTagForComparison(tag);
    if (!toUpsert.has(key)) toUpsert.set(key, tag);
  }

  return { toUpsert: [...toUpsert.values()], tagRuleChangeSets };
}

/** Apply a plan inside the commit's transaction, so a rollback takes it too. */
export function applyCommitTagVocabulary(tx: FinanceDb, plan: CommitTagPlan): void {
  for (const tag of plan.toUpsert) {
    tagVocabularyService.upsertVocabularyTag(tx, tag, 'user');
  }
}
