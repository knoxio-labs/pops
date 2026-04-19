import { useCallback, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { trpc } from '@pops/api-client';

import { computeMergedEntities } from '../../../lib/merged-state';
import { useImportStore } from '../../../store/importStore';
import {
  type LocalTxState,
  moveToMatched,
  pluralize,
  type UseBulkAssignmentArgs,
} from './bulk-assignment/types';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../store/importStore';

function useEntities() {
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
  openRuleProposalDialog: UseBulkAssignmentArgs['openRuleProposalDialog'];
}

function useAcceptAll(args: AcceptAllArgs) {
  const {
    entities,
    addPendingEntity,
    dbEntitiesData,
    setLocalTransactions,
    openRuleProposalDialog,
  } = args;
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
        toast.success(`Accepted ${pluralize(transactions.length)}`);
        if (firstTx) openRuleProposalDialog(firstTx, resolvedEntityId, entityName);
      } catch (error) {
        toast.error(
          `Failed to accept: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    },
    [entities, addPendingEntity, dbEntitiesData?.data, openRuleProposalDialog, setLocalTransactions]
  );
}

interface UseEntityCreatedArgs {
  pendingBulkTransactions: ProcessedTransaction[] | null;
  selectedTransaction: ProcessedTransaction | null;
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  setPendingBulkTransactions: Dispatch<SetStateAction<ProcessedTransaction[] | null>>;
  setSelectedTransaction: Dispatch<SetStateAction<ProcessedTransaction | null>>;
  handleEntitySelect: UseBulkAssignmentArgs['handleEntitySelect'];
  generateProposal: UseBulkAssignmentArgs['generateProposal'];
}

function useEntityCreated(args: UseEntityCreatedArgs) {
  const {
    pendingBulkTransactions,
    selectedTransaction,
    setLocalTransactions,
    setPendingBulkTransactions,
    setSelectedTransaction,
    handleEntitySelect,
    generateProposal,
  } = args;
  return useCallback(
    (entity: { entityId: string; entityName: string }) => {
      if (pendingBulkTransactions && pendingBulkTransactions.length > 0) {
        const bulkCount = pendingBulkTransactions.length;
        const firstTx = pendingBulkTransactions[0] ?? null;
        setLocalTransactions((prev) => moveToMatched(prev, pendingBulkTransactions, entity));
        setPendingBulkTransactions(null);
        setSelectedTransaction(null);
        toast.success(`Created "${entity.entityName}" and assigned to ${pluralize(bulkCount)}`);
        if (firstTx) {
          void generateProposal({
            triggeringTransaction: firstTx,
            entityId: entity.entityId,
            entityName: entity.entityName,
            location: firstTx.location ?? null,
            transactionType: firstTx.transactionType ?? null,
          });
        }
        return;
      }
      if (selectedTransaction) {
        handleEntitySelect(selectedTransaction, entity.entityId, entity.entityName);
        setSelectedTransaction(null);
      }
    },
    [
      pendingBulkTransactions,
      selectedTransaction,
      setLocalTransactions,
      setPendingBulkTransactions,
      setSelectedTransaction,
      handleEntitySelect,
      generateProposal,
    ]
  );
}

function useAcceptAiSuggestion(args: {
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

/**
 * Manages bulk assignment operations: accept-all, create-and-assign-all,
 * entity creation, and the EntityCreateDialog state for the ReviewStep.
 */
export function useBulkAssignment(args: UseBulkAssignmentArgs) {
  const { setLocalTransactions, handleEntitySelect, openRuleProposalDialog, generateProposal } =
    args;
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(null);
  const [pendingBulkTransactions, setPendingBulkTransactions] = useState<
    ProcessedTransaction[] | null
  >(null);

  const { entities, addPendingEntity, dbEntitiesData } = useEntities();

  const handleCreateEntity = useCallback((transaction: ProcessedTransaction) => {
    setSelectedTransaction(transaction);
    setShowCreateDialog(true);
  }, []);

  const handleAcceptAiSuggestion = useAcceptAiSuggestion({
    entities,
    handleEntitySelect,
    handleCreateEntity,
    openRuleProposalDialog,
  });

  const handleAcceptAll = useAcceptAll({
    entities,
    addPendingEntity,
    dbEntitiesData,
    setLocalTransactions,
    openRuleProposalDialog,
  });

  const handleCreateAndAssignAll = useCallback(
    (transactions: ProcessedTransaction[], _entityName: string) => {
      setPendingBulkTransactions(transactions);
      setSelectedTransaction(transactions[0] ?? null);
      setShowCreateDialog(true);
    },
    []
  );

  const handleEntityCreated = useEntityCreated({
    pendingBulkTransactions,
    selectedTransaction,
    setLocalTransactions,
    setPendingBulkTransactions,
    setSelectedTransaction,
    handleEntitySelect,
    generateProposal,
  });

  return {
    showCreateDialog,
    setShowCreateDialog,
    selectedTransaction,
    setSelectedTransaction,
    pendingBulkTransactions,
    setPendingBulkTransactions,
    entities,
    dbEntitiesData,
    handleCreateEntity,
    handleAcceptAiSuggestion,
    handleAcceptAll,
    handleCreateAndAssignAll,
    handleEntityCreated,
  };
}
