import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { requiresEntity } from '../../../lib/transaction-type';
import { promptToLearn } from './learn-prompt';
import { bucketOfChecksum, replaceByChecksum } from './local-tx-reconcile';

import type { Dispatch, SetStateAction } from 'react';

import type { TransactionType } from '../../../lib/transaction-type';
import type { ProcessedTransaction } from '../../../store/importStore';
import type { LocalTxState } from './local-tx-reconcile';
import type { RecomputeForEntity } from './useSuggestedTagRecompute';

type GenerateProposal = (args: {
  triggeringTransaction: ProcessedTransaction;
  entityId: string | null;
  entityName: string | null;
  location?: string | null;
  transactionType?: TransactionType | null;
}) => Promise<void>;

interface UseTransactionEditingArgs {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  generateProposal: GenerateProposal;
  recomputeForEntity: RecomputeForEntity;
}

const COMPARABLE_FIELDS = ['description', 'amount', 'location', 'transactionType'] as const;

function detectChange(
  transaction: ProcessedTransaction,
  editedFields: Partial<ProcessedTransaction>
): boolean {
  const fieldChanged = COMPARABLE_FIELDS.some(
    (field) => field in editedFields && editedFields[field] !== transaction[field]
  );
  const entityChanged =
    'entity' in editedFields && editedFields.entity?.entityId !== transaction.entity?.entityId;
  return fieldChanged || entityChanged;
}

function pickValue<T>(edited: T | undefined, original: T | undefined, fallback: T): T {
  return edited ?? original ?? fallback;
}

function buildLearnArgs(
  transaction: ProcessedTransaction,
  editedFields: Partial<ProcessedTransaction>
) {
  return {
    triggeringTransaction: transaction,
    entityId: editedFields.entity?.entityId ?? transaction.entity?.entityId ?? null,
    entityName: editedFields.entity?.entityName ?? transaction.entity?.entityName ?? null,
    location: editedFields.location ?? transaction.location ?? null,
    transactionType: pickValue(
      editedFields.transactionType,
      transaction.transactionType,
      'purchase' as const
    ),
  };
}

/**
 * Apply an inline edit through the canonical `replaceByChecksum` identity
 * (#3590/#3620) instead of matching by object reference — an edited
 * transaction is a new object, so reference-equality replace silently
 * dropped the edit whenever the bucket array had been rebuilt (e.g. by a
 * server reconciliation) between render and save.
 *
 * The inserted transaction's `status` is forced to `targetBucket`: the stale
 * `transaction` snapshot was captured at edit start, so a server reconciliation
 * in the meantime can have moved this checksum into a different bucket. Keeping
 * the snapshot's `status` would insert the card into `targetBucket` while
 * carrying a mismatched status, breaking the bucket/status invariant.
 */
function applyEditToBucket(
  prev: LocalTxState,
  transaction: ProcessedTransaction,
  updatedTx: ProcessedTransaction
): LocalTxState {
  // Entity-optional types (transfer/income/loan/rebate/tax/reversal) commit
  // without a merchant, so pull them into `matched` — the only bucket the
  // confirm step reads. This mirrors the confirm gate's own `requiresEntity`
  // predicate; a stale `transfer||income` hardcode used to strand a card
  // reclassified to loan/rebate/tax in its old bucket and silently drop it.
  const isEntityOptional = !requiresEntity(updatedTx.transactionType);
  const targetBucket = isEntityOptional
    ? 'matched'
    : (bucketOfChecksum(prev, transaction.checksum) ?? 'matched');
  return replaceByChecksum(prev, transaction.checksum, targetBucket, () => ({
    ...updatedTx,
    status: targetBucket,
  }));
}

function showLearnToast(invokeRetry: () => void): void {
  promptToLearn(invokeRetry);
  toast.success('Transaction updated');
}

/**
 * The entity the edit repoints the row to, or null when it leaves the merchant
 * alone. Repointing is a manual assignment like any other, so the row's tag
 * suggestions — computed for the previous entity — have to be re-derived
 * (POPS-2595).
 */
function repointedEntityId(
  transaction: ProcessedTransaction,
  editedFields: Partial<ProcessedTransaction>
): string | null {
  const nextEntityId = editedFields.entity?.entityId;
  if (!nextEntityId || nextEntityId === transaction.entity?.entityId) return null;
  return nextEntityId;
}

interface SaveEditDeps {
  setLocalTransactions: Dispatch<SetStateAction<LocalTxState>>;
  setEditingTransaction: Dispatch<SetStateAction<ProcessedTransaction | null>>;
  generateProposal: GenerateProposal;
  recomputeForEntity: RecomputeForEntity;
}

function buildSaveEdit(deps: SaveEditDeps) {
  const fn = (
    transaction: ProcessedTransaction,
    editedFields: Partial<ProcessedTransaction>,
    shouldLearn = false
  ): void => {
    const isRuleMatched =
      Boolean(transaction.ruleProvenance) || transaction.entity?.matchType === 'learned';
    const hasChanges = detectChange(transaction, editedFields);

    if (isRuleMatched && hasChanges) {
      deps.setEditingTransaction(null);
      void deps.generateProposal(buildLearnArgs(transaction, editedFields));
      return;
    }

    const updatedTx: ProcessedTransaction = {
      ...transaction,
      ...editedFields,
      manuallyEdited: true,
    };
    deps.setLocalTransactions((prev) => applyEditToBucket(prev, transaction, updatedTx));
    deps.setEditingTransaction(null);

    const repointedTo = repointedEntityId(transaction, editedFields);
    if (repointedTo) void deps.recomputeForEntity([updatedTx], repointedTo);

    if (shouldLearn && hasChanges) {
      void deps.generateProposal(buildLearnArgs(transaction, editedFields));
      return;
    }
    if (hasChanges) {
      showLearnToast(() => fn(transaction, editedFields, true));
      return;
    }
    toast.success('Transaction updated');
  };
  return fn;
}

/**
 * Manages transaction editing state and save/cancel handlers for the ReviewStep.
 */
export function useTransactionEditing({
  setLocalTransactions,
  generateProposal,
  recomputeForEntity,
}: UseTransactionEditingArgs) {
  const [editingTransaction, setEditingTransaction] = useState<ProcessedTransaction | null>(null);

  const handleEdit = useCallback((transaction: ProcessedTransaction) => {
    setEditingTransaction(transaction);
  }, []);

  const handleSaveEdit = useCallback(
    buildSaveEdit({
      setLocalTransactions,
      setEditingTransaction,
      generateProposal,
      recomputeForEntity,
    }),
    [setLocalTransactions, generateProposal, recomputeForEntity]
  );

  const handleCancelEdit = useCallback(() => setEditingTransaction(null), []);

  return { editingTransaction, handleEdit, handleSaveEdit, handleCancelEdit };
}
