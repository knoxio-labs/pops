import { useCallback } from 'react';
import { toast } from 'sonner';

import { resolveSuggestedMerchant } from '../../entity-existence';
import { type LocalTxState, moveToMatched, pluralize, type UseBulkAssignmentArgs } from './types';

import type { Dispatch, SetStateAction } from 'react';

import type { EntityIdentities } from '@pops/finance';

import type { ProcessedTransaction } from '../../../../store/importStore';
import type { useEntities } from '../useEntities';

interface AcceptAllArgs {
  identities?: ReturnType<typeof useEntities>['identities'];
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
  const existing = entities ? resolveSuggestedMerchant(entities, entityName)?.id : undefined;
  if (existing) return existing;
  const pending = addPendingEntity({ name: entityName, type: 'company' }, dbEntities);
  return pending.tempId;
}

function canAcceptGroup(
  identities: EntityIdentities | undefined,
  transactions: readonly ProcessedTransaction[]
): identities is EntityIdentities {
  if (transactions.length === 0) return false;
  if (identities) return true;
  toast.error('Contact identities are unavailable; retry before assigning.');
  return false;
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
    identities,
    addPendingEntity,
    dbEntities,
    setLocalTransactions,
    generateProposal,
    recomputeForEntity,
  } = args;
  return useCallback(
    async (transactions: ProcessedTransaction[]) => {
      if (!canAcceptGroup(identities, transactions)) return;
      const firstTx = transactions[0];
      const entityName = firstTx?.entity?.entityName;
      if (!firstTx || !entityName) {
        toast.error('No entity name found');
        return;
      }
      try {
        const entityId =
          firstTx.entity?.entityId ??
          resolveEntityId(entityName, entities, addPendingEntity, dbEntities);
        setLocalTransactions((prev) =>
          moveToMatched(prev, transactions, { entityId, entityName, identities })
        );
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
      identities,
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
        let matching;
        try {
          matching = resolveSuggestedMerchant(entities, transaction.entity.entityName);
        } catch (error) {
          toast.error(error instanceof Error ? error.message : 'Ambiguous merchant name');
          return;
        }
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
