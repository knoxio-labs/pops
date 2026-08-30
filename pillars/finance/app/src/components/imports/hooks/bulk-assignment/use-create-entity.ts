import { useCallback } from 'react';
import { toast } from 'sonner';

import { type CreatedEntity, useAssignCreatedToGroup } from './use-entity-created';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';
import type { useEntities } from '../useEntities';
import type { LocalTxState, UseBulkAssignmentArgs } from './types';

interface UseCreateEntityArgs {
  addPendingEntity: ReturnType<typeof useEntities>['addPendingEntity'];
  dbEntities: ReturnType<typeof useEntities>['dbEntities'];
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  handleEntitySelect: UseBulkAssignmentArgs['handleEntitySelect'];
  generateProposal: UseBulkAssignmentArgs['generateProposal'];
  recomputeForEntity: UseBulkAssignmentArgs['recomputeForEntity'];
}

/**
 * Creation driven by an entity picker's "Create …" row: the name comes from
 * what the user typed, so there is nothing left to confirm in a dialog.
 *
 * Returns the per-transaction and per-group handlers, which differ in how the
 * assignment is recorded — a single fix proposes a rule only when the import
 * holds similar transactions, a group always does.
 */
export function useCreateEntity(args: UseCreateEntityArgs) {
  const {
    addPendingEntity,
    dbEntities,
    setLocalTransactions,
    handleEntitySelect,
    generateProposal,
    recomputeForEntity,
  } = args;

  /**
   * Mint a locally-pending entity, returning null (after a toast) when
   * `addPendingEntity` rejects the name as a case-insensitive duplicate of one
   * already pending or already in the DB.
   */
  const createPendingEntity = useCallback(
    (name: string): CreatedEntity | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      try {
        const entity = addPendingEntity({ name: trimmed, type: 'company' }, dbEntities);
        return { entityId: entity.tempId, entityName: entity.name };
      } catch (error) {
        toast.error(
          `Failed to create entity: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return null;
      }
    },
    [addPendingEntity, dbEntities]
  );

  const assignCreatedToGroup = useAssignCreatedToGroup({
    setLocalTransactions,
    generateProposal,
    recomputeForEntity,
  });

  const handleCreateAndAssignAll = useCallback(
    (transactions: ProcessedTransaction[], entityName: string) => {
      const entity = createPendingEntity(entityName);
      if (entity) assignCreatedToGroup(transactions, entity);
    },
    [createPendingEntity, assignCreatedToGroup]
  );

  const handleCreateEntityWithName = useCallback(
    (transaction: ProcessedTransaction, entityName: string) => {
      const entity = createPendingEntity(entityName);
      if (entity) handleEntitySelect(transaction, entity.entityId, entity.entityName);
    },
    [createPendingEntity, handleEntitySelect]
  );

  return { handleCreateAndAssignAll, handleCreateEntityWithName };
}
