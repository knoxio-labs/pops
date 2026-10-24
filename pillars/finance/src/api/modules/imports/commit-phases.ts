import { importCommitsService, importDraftsService, type FinanceDb } from '../../../db/index.js';
import { applyChangeSetsPhase, applyTagRuleChangeSetsPhase } from './commit-changesets.js';
import { enqueueOutboxCandidatesPhase } from './commit-contacts-precreate.js';
import { recordOutcomePhases, writeTransactionsPhase } from './commit-recording.js';
import { applyCommitTagVocabulary } from './commit-tag-vocabulary.js';
import { reclassifyExistingTransactions } from './reclassify-existing.js';

import type { EntityIdentities } from '../../../db/services/entity-identity.js';
import type { preCreatePendingContacts } from './commit-contacts-precreate.js';
import type { LiveDraftContext } from './commit-live-draft.js';
import type { planCommitTagVocabulary } from './commit-tag-vocabulary.js';
import type { CommitPayload, CommitResult } from './types.js';

/** Immutable network and validation results prepared before the SQLite transaction opens. */
export interface PreparedCommitPhases {
  contacts: Awaited<ReturnType<typeof preCreatePendingContacts>>;
  tagPlan: ReturnType<typeof planCommitTagVocabulary>;
  liveDraft: LiveDraftContext | undefined;
  identities: EntityIdentities;
}

/** Apply every prepared import phase atomically; preserves historical foreign identifiers. */
export function applyCommitPhases(
  tx: FinanceDb,
  payload: CommitPayload,
  prepared: PreparedCommitPhases
): CommitResult {
  const { tempIdMap, entitiesCreated, outboxCandidates } = prepared.contacts;
  const { tagPlan, liveDraft, identities } = prepared;
  enqueueOutboxCandidatesPhase(tx, outboxCandidates);
  applyCommitTagVocabulary(tx, tagPlan);
  const correctionPhase = applyChangeSetsPhase(tx, payload, tempIdMap);
  const tagRulePhase = applyTagRuleChangeSetsPhase(
    tx,
    tagPlan.tagRuleChangeSets,
    tempIdMap,
    identities
  );
  const writeResult = writeTransactionsPhase(tx, payload, tempIdMap);

  const retroactiveReclassifications = reclassifyExistingTransactions(
    tx,
    payload.transactions.map((t) => t.checksum).filter((c): c is string => c != null),
    identities
  );

  const { checkpoints, warnings, batches } = recordOutcomePhases(
    tx,
    payload,
    writeResult,
    liveDraft
  );

  const result: CommitResult = {
    entitiesCreated,
    rulesApplied: correctionPhase.counts,
    correctionRuleWrites: correctionPhase.writes,
    tagRulesApplied: tagRulePhase.applied,
    tagRuleWrites: tagRulePhase.writes,
    transactionsImported: writeResult.imported,
    transactionsFailed: writeResult.failed,
    failedDetails: writeResult.failedDetails,
    retroactiveReclassifications,
    ...(warnings.length > 0 ? { warnings } : {}),
    checkpoints,
    batches,
  };

  if (payload.commitKey) importCommitsService.recordCommit(tx, payload.commitKey, result);
  if (payload.draftId) importDraftsService.discardImportDraft(tx, payload.draftId);
  return result;
}
