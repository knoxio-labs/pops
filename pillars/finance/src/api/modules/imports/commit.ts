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
 * `dropTagsOnlyAddOps` before applying it: a tags-only/entityName-only add op
 * (no `entityId`, no `transactionType`, non-empty `tags`) violates the
 * classification-rule/tag-rule table boundary (CF061/#3650) and would throw
 * inside `applyAddOp` — inside this commit's single transaction, that throw
 * would roll back every transaction insert and entity creation over one inert
 * rule. `proposeChangeSetFromCorrectionSignal` already filters this shape out
 * before a user can approve it, so this is a second, defense-in-depth layer
 * for a ChangeSet that reaches commit some other way (a hand-built payload,
 * the AI revise path, a future caller): the bad op is dropped with a logged
 * warning and the rest of the commit proceeds.
 *
 * The outer `db.transaction` handle (`tx`) is threaded into every inner service
 * so the correction/tag-rule ChangeSet applies nest as savepoints rather than
 * opening independent transactions.
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
import {
  type FinanceDb,
  importCommitsService,
  importsService,
  tagVocabularyService,
} from '../../../db/index.js';
import { type ContactsClient } from '../../contacts/client.js';
import { applyChangeSet, dropTagsOnlyAddOps } from '../corrections/index.js';
import { applyTagRuleChangeSet } from '../tag-rules/service.js';
import {
  enqueueOutboxCandidatesPhase,
  preCreatePendingContacts,
} from './commit-contacts-precreate.js';
import {
  collectTagsFromTagRuleChangeSet,
  resolveChangeSetTempIds,
  resolveTagRuleChangeSetTempIds,
} from './commit-temp-resolver.js';
import {
  assertPersistableEntityId,
  COMMIT_TEMP_ENTITY_PREFIX,
  validateCommitPayload,
} from './commit-validation.js';
import { reclassifyExistingTransactions } from './reclassify-existing.js';

import type { CommitPayload, CommitResult, FailedTransactionDetail } from './types.js';

interface RuleApplyCounts {
  add: number;
  edit: number;
  disable: number;
  remove: number;
}

interface SanitizedProvenance {
  matchType: CommitPayload['transactions'][number]['matchType'] | null;
  matchRuleId: string | null;
  matchConfidence: number | null;
}

/**
 * Drop provenance fields that are meaningless for the given `matchType` before
 * persisting, so the DB never stores an inconsistent combination sent by a
 * client (e.g. `matchType: 'exact'` carrying a `matchRuleId`). A rule id is only
 * meaningful for `learned` matches; a confidence only for `ai`/`learned` ones.
 */
function sanitizeProvenance(txn: CommitPayload['transactions'][number]): SanitizedProvenance {
  const matchType = txn.matchType ?? null;
  const matchRuleId = matchType === 'learned' ? (txn.matchRuleId ?? null) : null;
  const matchConfidence =
    matchType === 'ai' || matchType === 'learned' ? (txn.matchConfidence ?? null) : null;
  return { matchType, matchRuleId, matchConfidence };
}

/** The previously recorded result for `commitKey`, re-validated against the
 * wire contract, or `undefined` if this key has never been committed. */
function readCommittedResult(db: FinanceDb, commitKey: string): CommitResult | undefined {
  const json = importCommitsService.findCommittedResultJson(db, commitKey);
  return json === undefined ? undefined : CommitResultSchema.parse(json);
}

function applyChangeSetsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): RuleApplyCounts {
  const counts: RuleApplyCounts = { add: 0, edit: 0, disable: 0, remove: 0 };
  for (const cs of payload.changeSets) {
    const resolved = resolveChangeSetTempIds(cs, tempIdMap);
    const sanitized = dropTagsOnlyAddOps(resolved);
    if (sanitized.ops.length === 0) continue;
    applyChangeSet(tx, sanitized);
    for (const op of sanitized.ops) counts[op.op]++;
  }
  return counts;
}

function applyTagRuleChangeSetsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): number {
  let tagRulesApplied = 0;
  for (const cs of payload.tagRuleChangeSets) {
    const resolved = resolveTagRuleChangeSetTempIds(cs, tempIdMap);
    for (const tag of collectTagsFromTagRuleChangeSet(resolved)) {
      tagVocabularyService.upsertVocabularyTag(tx, tag, 'user');
    }
    applyTagRuleChangeSet(tx, resolved);
    tagRulesApplied += resolved.ops.length;
  }
  return tagRulesApplied;
}

function deriveTransactionType(
  txnType: string | null | undefined
): 'Transfer' | 'Income' | 'Expense' {
  if (txnType === 'transfer') return 'Transfer';
  if (txnType === 'income') return 'Income';
  return 'Expense';
}

interface WriteTxnsResult {
  imported: number;
  failed: number;
  failedDetails: FailedTransactionDetail[];
}

function resolveTxnEntityId(
  entityId: string | undefined,
  tempIdMap: Map<string, string>
): string | undefined {
  if (entityId == null) return undefined;
  const resolved = entityId.startsWith(COMMIT_TEMP_ENTITY_PREFIX)
    ? tempIdMap.get(entityId)
    : entityId;
  assertPersistableEntityId(entityId, resolved);
  return resolved;
}

function writeTransactionsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): WriteTxnsResult {
  let imported = 0;
  let failed = 0;
  const failedDetails: FailedTransactionDetail[] = [];

  for (const txn of payload.transactions) {
    const entityId = resolveTxnEntityId(txn.entityId, tempIdMap);
    const provenance = sanitizeProvenance(txn);
    try {
      importsService.insertImportTransaction(tx, {
        description: txn.description,
        account: txn.account,
        amount: txn.amount,
        date: txn.date,
        type: deriveTransactionType(txn.transactionType),
        tags: txn.tags ?? [],
        entityId: entityId ?? null,
        entityName: txn.entityName ?? null,
        location: txn.location ?? null,
        rawRow: txn.rawRow,
        checksum: txn.checksum,
        matchType: provenance.matchType,
        matchRuleId: provenance.matchRuleId,
        matchConfidence: provenance.matchConfidence,
      });
      imported++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`[CommitImport] Transaction write failed: ${errorMessage}`);
      failed++;
      failedDetails.push({ checksum: txn.checksum ?? null, error: errorMessage });
    }
  }

  return { imported, failed, failedDetails };
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

  const { tempIdMap, entitiesCreated, outboxCandidates } = await preCreatePendingContacts(
    contacts,
    payload
  );

  try {
    return db.transaction((tx) => {
      enqueueOutboxCandidatesPhase(tx, outboxCandidates);
      const rulesApplied = applyChangeSetsPhase(tx, payload, tempIdMap);
      const tagRulesApplied = applyTagRuleChangeSetsPhase(tx, payload, tempIdMap);
      const writeResult = writeTransactionsPhase(tx, payload, tempIdMap);

      const retroactiveReclassifications = reclassifyExistingTransactions(
        tx,
        payload.transactions.map((t) => t.checksum).filter((c): c is string => c != null)
      );

      const result: CommitResult = {
        entitiesCreated,
        rulesApplied,
        tagRulesApplied,
        transactionsImported: writeResult.imported,
        transactionsFailed: writeResult.failed,
        failedDetails: writeResult.failedDetails,
        retroactiveReclassifications,
      };

      if (commitKey) importCommitsService.recordCommit(tx, commitKey, result);
      return result;
    });
  } catch (error) {
    if (commitKey && importCommitsService.isImportCommitUniqueViolation(error)) {
      const raced = readCommittedResult(db, commitKey);
      if (raced) return raced;
    }
    throw error;
  }
}
