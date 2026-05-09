import { useCallback } from 'react';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { computeMergedEntities } from '../../../../lib/merged-state';
import { useImportStore } from '../../../../store/importStore';
import { type LocalTxState, moveToMatched, pluralize, type UseBulkAssignmentArgs } from './types';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';

export function useEntities() {
  const { data: dbEntitiesData } = trpc.core.entities.list.useQuery({});
  const pendingEntities = useImportStore((s) => s.pendingEntities);
  const addPendingEntity = useImportStore((s) => s.addPendingEntity);
  const entities = useMemo(
    () =>
      dbEntitiesData?.data
        ? computeMergedEntities(dbEntitiesData.data, pendingEntities)
        : undefined,
    [dbEntitiesData?.data, pendingEntities]
  );
  return { entities, addPendingEntity, dbEntitiesData };
}

interface AcceptAllArgs {
  entities: ReturnType<typeof useEntities>['entities'];
  addPendingEntity: ReturnType<typeof useEntities>['addPendingEntity'];
  dbEntitiesData: ReturnType<typeof useEntities>['dbEntitiesData'];
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
}

/**
 * Bulk-accept assigns the AI-suggested entity directly without opening the
 * Correction Proposal dialog. Users who want to edit the proposed rule before
 * applying use the per-row Accept path (`useAcceptAiSuggestion`), which still
 * routes through the dialog.
 */
export function useAcceptAll(args: AcceptAllArgs) {
  const { entities, addPendingEntity, dbEntitiesData, setLocalTransactions } = args;
  return useCallback(
    async (transactions: ProcessedTransaction[]) => {
      if (transactions.length === 0) return;
      const firstTx = transactions[0];
      const entityName = firstTx?.entity?.entityName;
      if (!entityName) {
        toast.error('No entity name found');
        return;
      }
      try {
        let entityId = entities?.find((e) => e.name.toLowerCase() === entityName.toLowerCase())?.id;
        if (!entityId) {
          const pending = addPendingEntity(
            { name: entityName, type: 'company' },
            dbEntitiesData?.data
          );
          entityId = pending.tempId;
        }
        const resolvedEntityId = entityId;
        setLocalTransactions((prev) =>
          moveToMatched(prev, transactions, { entityId: resolvedEntityId, entityName })
        );
        toast.success(`Accepted ${pluralize(transactions.length)} as "${entityName}"`);
      } catch (error) {
        toast.error(
          `Failed to accept: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
    [entities, addPendingEntity, dbEntitiesData?.data, setLocalTransactions]
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
        const matching = entities.find(
          (e) => e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase()
        );
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
