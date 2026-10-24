/**
 * Import commit: apply correction + tag-rule ChangeSets, write transactions,
 * and retroactively re-classify existing rows inside one SQLite transaction.
 * A thrown error anywhere in the ChangeSet-apply or reclassification phases
 * rolls the whole SQLite transaction back. Per-transaction inserts are the
 * exception: `writeTransactionsPhase` catches and counts individual insert
 * failures rather than throwing, so one bad row lands in `failedDetails`
 * without rolling back the ChangeSets or the other rows already written.
 *
 * The contacts pre-create phase (network, run before the SQLite transaction
 * opens) lives in `commit-contacts-precreate.ts` — see that file for how a
 * contacts outage degrades to an outbox placeholder instead of aborting
 * (#3683).
 *
 * `applyChangeSetsPhase` runs every correction ChangeSet through
 * `dropUnusableAddOps` before applying it. Two add-op shapes can only ever
 * produce a rule that never fires: a tags-only/entityName-only op (no
 * `entityId`, no `transactionType`, non-empty `tags`), which violates the
 * classification-rule/tag-rule table boundary (CF061/#3650); and a `regex` op
 * whose pattern does not compile (POPS-2600). Either would throw inside
 * `applyAddOp` — inside this commit's single transaction, that throw would
 * roll back every transaction insert and entity creation over one inert rule.
 * The bad op is dropped with a logged warning and the rest of the commit
 * proceeds. `proposeChangeSetFromCorrectionSignal` filters the tags-only
 * shape out before a user can approve it; the uncompilable regex has no such
 * upstream filter, because the correction detail editor pairs a free-text
 * pattern with a `regex` option and validates nothing client-side.
 *
 * The outer `db.transaction` handle (`tx`) is threaded into every inner service
 * so the correction/tag-rule ChangeSet applies nest as savepoints rather than
 * opening independent transactions.
 *
 * Which tags a commit may add to `tag_vocabulary` is decided by
 * `planCommitTagVocabulary` before the transaction opens (and before contacts
 * pre-create, which the transaction does not cover), so a payload naming a
 * value a closed namespace does not hold is refused with a 400 having written
 * nothing at all. The same call also filters each staged tag rule's tags down
 * to what `acceptedNewTags` allows (POPS-2643) — `applyTagRuleChangeSetsPhase`
 * applies that filtered set, not `payload.tagRuleChangeSets` directly, so a
 * declined tag reaches neither the rule nor the vocabulary. The upsert plan is
 * applied as the transaction's first phase, ahead of the transaction writes
 * whose `incrementVocabularyUsage` must find those rows already present.
 *
 * It runs AFTER the `commitKey` pre-flight below, not before it. The plan
 * validates against the vocabulary as it stands now, so validating a resubmit
 * would let a vocabulary that has moved on since — a tag deactivated, a
 * namespace tightened — turn an already-succeeded commit into a 400 on replay.
 * A recorded result is returned on its own terms; nothing about the payload is
 * re-judged (POPS-2602).
 *
 * `payload.commitKey` (issues #3640/#3642), when supplied, makes a resubmit
 * of the same commit a no-op: a pre-flight check returns the first call's
 * recorded result immediately (before contacts pre-create runs again), and
 * the SQLite transaction records the result under that key on success. A
 * race between two in-flight calls sharing a key is resolved by the key's
 * UNIQUE constraint — the loser's transaction rolls back (nothing it wrote
 * survives) and `commitImport` returns the winner's already-recorded result
 * instead of surfacing the constraint error.
 */
import { CommitResultSchema } from '../../../contract/rest-imports-schemas.js';
import { importCommitsService, type FinanceDb } from '../../../db/index.js';
import {
  EntityIdentityConflictError,
  referencedEntityIds,
} from '../../../db/services/entity-identity.js';
import { loadEntityIdentities } from '../../contacts/identity-snapshot.js';
import { ConflictError } from '../../shared/errors.js';
import { preCreatePendingContacts } from './commit-contacts-precreate.js';
import { liveDraftOf } from './commit-live-draft.js';
import { applyCommitPhases } from './commit-phases.js';
import { planCommitTagVocabulary } from './commit-tag-vocabulary.js';
import { validateCommitPayload } from './commit-validation.js';

import type { ContactsClient } from '../../contacts/types.js';
import type { CommitPayload, CommitResult } from './types.js';

/** The previously recorded result for `commitKey`, re-validated against the
 * wire contract, or `undefined` if this key has never been committed. */
function readCommittedResult(db: FinanceDb, commitKey: string): CommitResult | undefined {
  const json = importCommitsService.findCommittedResultJson(db, commitKey);
  return json === undefined ? undefined : CommitResultSchema.parse(json);
}

/**
 * Commit an import. Pending contacts are pre-created against the contacts
 * pillar first (network, outside the tx); the resolved tempId→id map then
 * feeds the synchronous SQLite transaction that applies ChangeSets, writes
 * transactions, and reclassifies. A pre-create failure that ISN'T a contacts
 * outage (see `preCreatePendingContacts`) still throws BEFORE the SQLite
 * transaction opens, so no finance-side row is written for that attempt —
 * but pre-created contacts themselves are not part of that transaction and
 * are not rolled back if a later phase fails. An outage instead queues an
 * outbox row (inside the tx) and the commit proceeds with a pending
 * placeholder.
 */
export async function commitImport(
  db: FinanceDb,
  contacts: ContactsClient,
  payload: CommitPayload
): Promise<CommitResult> {
  validateCommitPayload(payload);

  const { commitKey } = payload;
  if (commitKey) {
    const alreadyCommitted = readCommittedResult(db, commitKey);
    if (alreadyCommitted) return alreadyCommitted;
  }

  const tagPlan = planCommitTagVocabulary(db, payload);
  const liveDraft = liveDraftOf(db, payload.draftId);

  const preparedContacts = await preCreatePendingContacts(contacts, payload);

  const identities = await loadEntityIdentities(db, contacts, [
    ...referencedEntityIds(payload),
    ...preparedContacts.tempIdMap.values(),
  ]);

  try {
    return db.transaction((tx) =>
      applyCommitPhases(tx, payload, { contacts: preparedContacts, tagPlan, liveDraft, identities })
    );
  } catch (error) {
    if (error instanceof EntityIdentityConflictError) throw new ConflictError(error.message);
    if (commitKey && importCommitsService.isImportCommitUniqueViolation(error)) {
      const raced = readCommittedResult(db, commitKey);
      if (raced) return raced;
    }
    throw error;
  }
}
