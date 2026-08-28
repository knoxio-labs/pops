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

import type { CommitPayload } from './types.js';

/** The vocabulary writes a commit has been cleared to make. */
export interface CommitTagPlan {
  /** Open-kind tags absent from the vocabulary, to insert as `source: 'user'`. */
  readonly toUpsert: readonly string[];
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
 * The tags the user declined to add to the vocabulary (POPS-2597): every tag on
 * a staged tag rule that supplied an `acceptedNewTags` list and left it out.
 *
 * A declined tag is still written onto the rule — that is the existing
 * behaviour of the accept/decline checkbox — so it is the one case where a
 * committed tag is deliberately left out of the vocabulary, and the one hole in
 * the superset invariant. POPS-2643 decides whether declining should drop the
 * tag from the rule too or whether the checkbox has nothing left to decide.
 */
function collectDeclinedTags(payload: CommitPayload): Set<string> {
  const declined = new Set<string>();
  for (const entry of payload.tagRuleChangeSets) {
    if (!entry.acceptedNewTags) continue;
    const accepted = tagVocabularyService.createKnownTagSet(entry.acceptedNewTags);
    for (const tag of collectTagsFromTagRuleChangeSet(entry.changeSet)) {
      if (!accepted.has(tag)) {
        declined.add(tagVocabularyService.normalizeTagForComparison(tag));
      }
    }
  }
  return declined;
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
  const declined = collectDeclinedTags(payload);
  const toUpsert = new Map<string, string>();

  const committedTags = [
    ...payload.transactions.flatMap((txn) => trimmedTags(txn.tags)),
    ...payload.tagRuleChangeSets.flatMap((entry) =>
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
    if (declined.has(key)) continue;
    if (!toUpsert.has(key)) toUpsert.set(key, tag);
  }

  return { toUpsert: [...toUpsert.values()] };
}

/** Apply a plan inside the commit's transaction, so a rollback takes it too. */
export function applyCommitTagVocabulary(tx: FinanceDb, plan: CommitTagPlan): void {
  for (const tag of plan.toUpsert) {
    tagVocabularyService.upsertVocabularyTag(tx, tag, 'user');
  }
}
