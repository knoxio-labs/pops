/**
 * Import commit: apply correction + tag-rule ChangeSets, write transactions,
 * and retroactively re-classify existing rows inside one SQLite transaction.
 * A thrown error anywhere in the ChangeSet-apply or reclassification phases
 * rolls the whole SQLite transaction back. Per-transaction inserts are the
 * exception: `writeTransactionsPhase` catches and counts individual insert
 * failures rather than throwing, so one bad row lands in `failedDetails`
 * without rolling back the ChangeSets or the other rows already written.
 *
 * Pending contacts are pre-created against the contacts pillar BEFORE the
 * SQLite transaction opens (network can't live inside a better-sqlite3 sync
 * transaction). Each pre-create carries `{ name, type }` and is idempotent —
 * a 409 dup-name fetches the existing contact id so a retry after a rolled-back
 * finance tx reuses the contact. The resolved tempId→id map is threaded into
 * the synchronous transaction. Because this happens before the finance
 * transaction opens, a rollback of the finance side does not undo any
 * contacts already created there.
 *
 * When a pre-create fails with a TRANSIENT error (`ContactsUnavailableError`
 * — contacts unreachable or mid-recovery), the commit no longer aborts (issue
 * #3683): a `pending:contact:{uuid}` placeholder takes the entity's place in
 * the tempId map and a row is queued in `entity_precreate_outbox` — inside
 * the same finance transaction — so the outage is invisible to the importer.
 * `reconcile-contacts-outbox.ts` drains the outbox once contacts recovers,
 * rewriting the placeholder to the real contact id everywhere it landed. A
 * PERMANENT error (`ContactsPermanentError` — bad request, unauthorized,
 * contract mismatch) is NOT eligible for the outbox: retrying the same input
 * would fail identically forever, so it propagates and aborts the commit
 * exactly like any other unexpected error.
 *
 * The outer `db.transaction` handle (`tx`) is threaded into every inner service
 * so the correction/tag-rule ChangeSet applies nest as savepoints rather than
 * opening independent transactions.
 */
import {
  entityPrecreateOutboxService,
  type FinanceDb,
  importsService,
  tagVocabularyService,
} from '../../../db/index.js';
import { ContactsUnavailableError, type ContactsClient } from '../../contacts/client.js';
import { applyChangeSet } from '../corrections/index.js';
import { applyTagRuleChangeSet } from '../tag-rules/service.js';
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

/** A pending entity that couldn't be pre-created because contacts was down —
 * queued into `entity_precreate_outbox` for the background reconciler. */
interface OutboxCandidate {
  placeholderId: string;
  name: CommitPayload['entities'][number]['name'];
  type: CommitPayload['entities'][number]['type'];
}

/**
 * Pre-create every pending contact against the contacts pillar BEFORE the
 * finance transaction opens, returning the tempId→contact-id map. Each create
 * carries `{ name, type }` and is create-or-fetch-by-name, so a retry after a
 * rolled-back finance tx reuses the existing contact. `entitiesCreated` counts
 * ONLY real inserts — a reused (already-existing) contact must not inflate the
 * commit result's "Entities Created" card.
 *
 * A `ContactsUnavailableError` (TRANSIENT) no longer propagates: the tempId
 * maps to a fresh `pending:contact:{uuid}` placeholder instead, and the
 * entity is collected into `outboxCandidates` for the caller to queue once
 * the finance transaction opens. Any OTHER error — including
 * `ContactsPermanentError` (PERMANENT: bad request / unauthorized / contract
 * mismatch) and any genuine bug — still throws; only the documented
 * transient case degrades.
 */
async function preCreatePendingContacts(
  contacts: ContactsClient,
  payload: CommitPayload
): Promise<{
  tempIdMap: Map<string, string>;
  entitiesCreated: number;
  outboxCandidates: OutboxCandidate[];
}> {
  const tempIdMap = new Map<string, string>();
  const outboxCandidates: OutboxCandidate[] = [];
  let entitiesCreated = 0;
  for (const pending of payload.entities) {
    try {
      const { id, created } = await contacts.createOrFetchByName(pending.name, pending.type);
      tempIdMap.set(pending.tempId, id);
      if (created) entitiesCreated++;
    } catch (error) {
      if (!(error instanceof ContactsUnavailableError)) throw error;
      const placeholderId = entityPrecreateOutboxService.buildPendingContactId();
      tempIdMap.set(pending.tempId, placeholderId);
      outboxCandidates.push({ placeholderId, name: pending.name, type: pending.type });
    }
  }
  return { tempIdMap, entitiesCreated, outboxCandidates };
}

/** Queue every outbox candidate inside the finance transaction, so a rollback
 * of the rest of the commit rolls the outbox row back too. */
function enqueueOutboxCandidatesPhase(tx: FinanceDb, candidates: OutboxCandidate[]): void {
  for (const candidate of candidates) {
    entityPrecreateOutboxService.enqueue(tx, {
      id: candidate.placeholderId,
      name: candidate.name,
      type: candidate.type,
    });
  }
}

function applyChangeSetsPhase(
  tx: FinanceDb,
  payload: CommitPayload,
  tempIdMap: Map<string, string>
): RuleApplyCounts {
  const counts: RuleApplyCounts = { add: 0, edit: 0, disable: 0, remove: 0 };
  for (const cs of payload.changeSets) {
    const resolved = resolveChangeSetTempIds(cs, tempIdMap);
    applyChangeSet(tx, resolved);
    for (const op of resolved.ops) counts[op.op]++;
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

  const { tempIdMap, entitiesCreated, outboxCandidates } = await preCreatePendingContacts(
    contacts,
    payload
  );

  return db.transaction((tx) => {
    enqueueOutboxCandidatesPhase(tx, outboxCandidates);
    const rulesApplied = applyChangeSetsPhase(tx, payload, tempIdMap);
    const tagRulesApplied = applyTagRuleChangeSetsPhase(tx, payload, tempIdMap);
    const writeResult = writeTransactionsPhase(tx, payload, tempIdMap);

    const retroactiveReclassifications = reclassifyExistingTransactions(
      tx,
      payload.transactions.map((t) => t.checksum).filter((c): c is string => c != null)
    );

    return {
      entitiesCreated,
      rulesApplied,
      tagRulesApplied,
      transactionsImported: writeResult.imported,
      transactionsFailed: writeResult.failed,
      failedDetails: writeResult.failedDetails,
      retroactiveReclassifications,
    };
  });
}
