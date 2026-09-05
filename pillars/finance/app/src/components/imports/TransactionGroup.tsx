import { useState } from 'react';

import { Collapsible, CollapsibleContent, Label } from '@pops/ui';

import { EditableTransactionCard } from './EditableTransactionCard';
import { resolveEntityExistence } from './entity-existence';
import { EntitySelect } from './EntitySelect';
import { GroupHeader } from './transaction-group/GroupHeader';
import { TransactionCard } from './TransactionCard';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionGroup as TransactionGroupType } from '../../lib/transaction-utils';
import type { GroupVariant } from './transaction-group/GroupHeader';

interface TransactionGroupProps {
  group: TransactionGroupType;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onCreateAndAssignAll: (transactions: ProcessedTransaction[], entityName: string) => void;
  onEntitySelect: (transaction: ProcessedTransaction, entityId: string, entityName: string) => void;
  onBulkEntitySelect?: (
    transactions: ProcessedTransaction[],
    entityId: string,
    entityName: string
  ) => void;
  onCreateEntityWithName: (transaction: ProcessedTransaction, entityName: string) => void;
  onAcceptAiSuggestion: (transaction: ProcessedTransaction) => void;
  onEdit: (transaction: ProcessedTransaction) => void;
  editingTransaction?: ProcessedTransaction | null;
  onSaveEdit?: (
    transaction: ProcessedTransaction,
    editedFields: Partial<ProcessedTransaction>
  ) => void;
  onCancelEdit?: () => void;
  entities?: Array<{ id: string; name: string }>;
  variant?: GroupVariant;
}

interface BulkEntitySelectorProps {
  group: TransactionGroupType;
  entities: Array<{ id: string; name: string }>;
  onBulkEntitySelect?: TransactionGroupProps['onBulkEntitySelect'];
  onEntitySelect: TransactionGroupProps['onEntitySelect'];
  onCreateAndAssignAll: TransactionGroupProps['onCreateAndAssignAll'];
  onClose: () => void;
}

function BulkEntitySelector({
  group,
  entities,
  onBulkEntitySelect,
  onEntitySelect,
  onCreateAndAssignAll,
  onClose,
}: BulkEntitySelectorProps) {
  return (
    <div className="mt-3 p-3 bg-card rounded-lg border border-border">
      <Label className="block mb-2">
        Select entity to assign to all {group.transactions.length} transactions:
      </Label>
      <EntitySelect
        entities={entities}
        placeholder="Choose entity..."
        onChange={(entityId, entityName) => {
          if (onBulkEntitySelect) {
            onBulkEntitySelect(group.transactions, entityId, entityName);
          } else {
            for (const t of group.transactions) {
              onEntitySelect(t, entityId, entityName);
            }
          }
          onClose();
        }}
        onCreate={(entityName) => {
          onCreateAndAssignAll(group.transactions, entityName);
          onClose();
        }}
      />
    </div>
  );
}

interface TransactionListProps {
  group: TransactionGroupType;
  editingTransaction?: ProcessedTransaction | null;
  onSaveEdit?: TransactionGroupProps['onSaveEdit'];
  onCancelEdit?: () => void;
  onEntitySelect: TransactionGroupProps['onEntitySelect'];
  onCreateEntityWithName: TransactionGroupProps['onCreateEntityWithName'];
  onAcceptAiSuggestion: TransactionGroupProps['onAcceptAiSuggestion'];
  onEdit: TransactionGroupProps['onEdit'];
  entities?: TransactionGroupProps['entities'];
  variant: GroupVariant;
}

function TransactionList(props: TransactionListProps) {
  const { group, editingTransaction, onSaveEdit, onCancelEdit, entities, variant } = props;
  return (
    <div className="p-4 space-y-3 border-t border-border">
      {group.transactions.map((transaction, idx) =>
        editingTransaction === transaction && onSaveEdit && onCancelEdit ? (
          <EditableTransactionCard
            key={idx}
            transaction={transaction}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            entities={entities}
          />
        ) : (
          <TransactionCard
            key={idx}
            transaction={transaction}
            onEntitySelect={props.onEntitySelect}
            onCreateEntityWithName={props.onCreateEntityWithName}
            onAcceptAiSuggestion={props.onAcceptAiSuggestion}
            onEdit={props.onEdit}
            entities={entities}
            variant={variant}
          />
        )
      )}
    </div>
  );
}

/**
 * Grouped view of transactions with bulk actions
 */
export function TransactionGroup(props: TransactionGroupProps) {
  const { group, entities, variant = 'uncertain' } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const [showEntitySelector, setShowEntitySelector] = useState(false);

  const totalAmount = group.transactions.reduce((sum, t) => sum + Math.abs(t.amount), 0);
  const existence = resolveEntityExistence(group.entityName, entities);

  return (
    <div
      className={`border rounded-lg ${group.aiSuggestion ? 'border-app-accent/30' : 'border-border'}`}
      data-testid="transaction-group"
    >
      <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
        <GroupHeader
          group={group}
          isExpanded={isExpanded}
          totalAmount={totalAmount}
          existence={existence}
          variant={variant}
          onAcceptAll={props.onAcceptAll}
          onToggleEntitySelector={() => setShowEntitySelector((v) => !v)}
        />
        {showEntitySelector && (
          <BulkEntitySelector
            group={group}
            entities={entities ?? []}
            onBulkEntitySelect={props.onBulkEntitySelect}
            onEntitySelect={props.onEntitySelect}
            onCreateAndAssignAll={props.onCreateAndAssignAll}
            onClose={() => setShowEntitySelector(false)}
          />
        )}
        <CollapsibleContent>
          <TransactionList
            group={group}
            editingTransaction={props.editingTransaction}
            onSaveEdit={props.onSaveEdit}
            onCancelEdit={props.onCancelEdit}
            onEntitySelect={props.onEntitySelect}
            onCreateEntityWithName={props.onCreateEntityWithName}
            onAcceptAiSuggestion={props.onAcceptAiSuggestion}
            onEdit={props.onEdit}
            entities={entities}
            variant={variant}
          />
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}
