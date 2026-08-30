import { useCallback, useState } from 'react';

import { type UseBulkAssignmentArgs } from './bulk-assignment/types';
import { useAcceptAiSuggestion, useAcceptAll } from './bulk-assignment/use-accept';
import { useCreateEntity } from './bulk-assignment/use-create-entity';
import { useEntityCreated } from './bulk-assignment/use-entity-created';
import { useEntities } from './useEntities';

import type { ProcessedTransaction } from '../../../store/importStore';

/**
 * Manages bulk assignment operations: accept-all, create-and-assign-all,
 * entity creation, and the EntityCreateDialog state for the ReviewStep.
 */
export function useBulkAssignment(args: UseBulkAssignmentArgs) {
  const {
    setLocalTransactions,
    handleEntitySelect,
    openRuleProposalDialog,
    generateProposal,
    recomputeForEntity,
  } = args;
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(null);

  const { entities, dbEntities, addPendingEntity } = useEntities();

  const handleCreateEntity = useCallback((transaction: ProcessedTransaction) => {
    setSelectedTransaction(transaction);
    setShowCreateDialog(true);
  }, []);

  const { handleCreateAndAssignAll, handleCreateEntityWithName } = useCreateEntity({
    addPendingEntity,
    dbEntities,
    setLocalTransactions,
    handleEntitySelect,
    generateProposal,
    recomputeForEntity,
  });

  const handleAcceptAiSuggestion = useAcceptAiSuggestion({
    entities,
    handleEntitySelect,
    handleCreateEntity,
    openRuleProposalDialog,
  });

  const handleAcceptAll = useAcceptAll({
    entities,
    addPendingEntity,
    dbEntities,
    setLocalTransactions,
    generateProposal,
    recomputeForEntity,
  });

  const handleEntityCreated = useEntityCreated({
    selectedTransaction,
    setSelectedTransaction,
    handleEntitySelect,
  });

  return {
    showCreateDialog,
    setShowCreateDialog,
    selectedTransaction,
    setSelectedTransaction,
    entities,
    dbEntities,
    handleCreateEntity,
    handleCreateEntityWithName,
    handleAcceptAiSuggestion,
    handleAcceptAll,
    handleCreateAndAssignAll,
    handleEntityCreated,
  };
}
