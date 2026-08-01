import { useCallback } from 'react';
import { toast } from 'sonner';

import { type CreatedEntity, useAssignCreatedToGroup } from './use-entity-created';

import type { Dispatch, SetStateAction } from 'react';

import type { ProcessedTransaction } from '../../../../store/importStore';
import type { useEntities } from '../useEntities';
import type { LocalTxState, UseBulkAssignmentArgs } from './types';

interface UseCreateEntityArgs {
  addPendingEntity: ReturnType<typeof useEntities>['addPendingEntity'];
  dbEntitiesData: ReturnType<typeof useEntities>['dbEntitiesData'];
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  handleEntitySelect: UseBulkAssignmentArgs['handleEntitySelect'];
  generateProposal: UseBulkAssignmentArgs['generateProposal'];
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
    dbEntitiesData,
    setLocalTransactions,
    handleEntitySelect,
    generateProposal,
  } = args;

  /**
   * Mint a locally-pending entity. Returns null (after a toast) when the name
   * collides with one the picker couldn't show — `entities` is a single capped
   * page, so "absent from the list" is not proof the merchant doesn't exist.
   */
  const createPendingEntity = useCallback(
    (name: string): CreatedEntity | null => {
      const trimmed = name.trim();
      if (!trimmed) return null;
      try {
        const entity = addPendingEntity({ name: trimmed, type: 'company' }, dbEntitiesData?.data);
        return { entityId: entity.tempId, entityName: entity.name };
      } catch (error) {
        toast.error(
          `Failed to create entity: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
        return null;
      }
    },
    [addPendingEntity, dbEntitiesData?.data]
  );

  const assignCreatedToGroup = useAssignCreatedToGroup({ setLocalTransactions, generateProposal });

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
