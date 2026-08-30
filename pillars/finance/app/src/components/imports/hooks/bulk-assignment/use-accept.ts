import { useCallback } from 'react';
import { toast } from 'sonner';

import { entityAnswersTo } from '../../entity-existence';
import { type LocalTxState, moveToMatched, pluralize, type UseBulkAssignmentArgs } from './types';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';
import type { useEntities } from '../useEntities';

interface AcceptAllArgs {
  entities: ReturnType<typeof useEntities>['entities'];
  addPendingEntity: ReturnType<typeof useEntities>['addPendingEntity'];
  dbEntities: ReturnType<typeof useEntities>['dbEntities'];
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  generateProposal: UseBulkAssignmentArgs['generateProposal'];
  recomputeForEntity: UseBulkAssignmentArgs['recomputeForEntity'];
}

function resolveEntityId(
  entityName: string,
  entities: AcceptAllArgs['entities'],
  addPendingEntity: AcceptAllArgs['addPendingEntity'],
  dbEntities: AcceptAllArgs['dbEntities']
): string {
  const target = entityName.toLowerCase();
  const existing = entities?.find((e) => entityAnswersTo(e, target))?.id;
  if (existing) return existing;
  const pending = addPendingEntity({ name: entityName, type: 'company' }, dbEntities);
  return pending.tempId;
}

/**
 * Bulk-accept assigns the AI-suggested entity to every transaction in the
 * group and then opens the Correction Proposal dialog seeded from the first
 * transaction. Approving the proposal persists a rule, so future imports
 * match the same descriptor automatically instead of re-prompting.
 */
export function useAcceptAll(args: AcceptAllArgs) {
  const {
    entities,
    addPendingEntity,
    dbEntities,
    setLocalTransactions,
    generateProposal,
    recomputeForEntity,
  } = args;
  return useCallback(
    async (transactions: ProcessedTransaction[]) => {
      if (transactions.length === 0) return;
      const firstTx = transactions[0];
      const entityName = firstTx?.entity?.entityName;
      if (!firstTx || !entityName) {
        toast.error('No entity name found');
        return;
      }
      try {
        const entityId = resolveEntityId(entityName, entities, addPendingEntity, dbEntities);
        setLocalTransactions((prev) => moveToMatched(prev, transactions, { entityId, entityName }));
        void recomputeForEntity(transactions, entityId);
        toast.success(`Accepted ${pluralize(transactions.length)} as "${entityName}"`);
        void generateProposal({
          triggeringTransaction: firstTx,
          entityId,
          entityName,
          location: firstTx.location ?? null,
          transactionType: firstTx.transactionType ?? null,
        });
      } catch (error) {
        toast.error(
          `Failed to accept: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
    [
      entities,
      addPendingEntity,
      dbEntities,
      setLocalTransactions,
      generateProposal,
      recomputeForEntity,
    ]
  );
}

export function useAcceptAiSuggestion(args: {
  entities: ReturnType<typeof useEntities>['entities'];
  handleEntitySelect: UseBulkAssignmentArgs['handleEntitySelect'];
  handleCreateEntity: (transaction: ProcessedTransaction) => void;
  openRuleProposalDialog: UseBulkAssignmentArgs['openRuleProposalDialog'];
}) {
  const { entities, handleEntitySelect, handleCreateEntity, openRuleProposalDialog } = args;
  return useCallback(
    (transaction: ProcessedTransaction) => {
      if (!transaction.entity?.entityName) return;
      let entityId = transaction.entity.entityId;
      if (!entityId && entities) {
        const target = transaction.entity.entityName.toLowerCase();
        const matching = entities.find((e) => entityAnswersTo(e, target));
        if (matching) entityId = matching.id;
      }
      if (!entityId) {
        handleCreateEntity(transaction);
        return;
      }
      const entityName = transaction.entity.entityName;
      handleEntitySelect(transaction, entityId, entityName);
      openRuleProposalDialog(transaction, entityId, entityName);
    },
    [handleEntitySelect, entities, handleCreateEntity, openRuleProposalDialog]
  );
}
