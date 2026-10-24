import { useCallback, useState } from 'react';

import { type UseBulkAssignmentArgs } from './bulk-assignment/types';
import { useAcceptAiSuggestion, useAcceptAll } from './bulk-assignment/use-accept';
import { useCreateEntity } from './bulk-assignment/use-create-entity';
import { useEntityCreated } from './bulk-assignment/use-entity-created';
import { useEntities } from './useEntities';

import type { ProcessedTransaction } from '../../../store/importStore';

function useCreateDialogState() {
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<ProcessedTransaction | null>(null);
  const handleCreateEntity = useCallback((transaction: ProcessedTransaction) => {
    setSelectedTransaction(transaction);
    setShowCreateDialog(true);
  }, []);
  return {
    showCreateDialog,
    setShowCreateDialog,
    selectedTransaction,
    setSelectedTransaction,
    handleCreateEntity,
  };
}

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
  const dialog = useCreateDialogState();

  const {
    entities,
    identities,
    dbEntities,
    addPendingEntity,
    entityVerification,
    retryEntityLookup,
  } = useEntities(args.identityIds);

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
    handleCreateEntity: dialog.handleCreateEntity,
    openRuleProposalDialog,
  });

  const handleAcceptAll = useAcceptAll({
    identities,
    entities,
    addPendingEntity,
    dbEntities,
    setLocalTransactions,
    generateProposal,
    recomputeForEntity,
  });

  const handleEntityCreated = useEntityCreated({
    selectedTransaction: dialog.selectedTransaction,
    setSelectedTransaction: dialog.setSelectedTransaction,
    handleEntitySelect,
  });

  return {
    ...dialog,
    entities,
    identities,
    dbEntities,
    entityVerification,
    retryEntityLookup,
    handleCreateEntityWithName,
    handleAcceptAiSuggestion,
    handleAcceptAll,
    handleCreateAndAssignAll,
    handleEntityCreated,
  };
}
