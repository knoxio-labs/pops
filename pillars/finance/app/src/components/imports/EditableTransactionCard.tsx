import { Save, X } from 'lucide-react';
import { useState } from 'react';

import { Button, EditableFormCard, Label, Select as UiSelect } from '@pops/ui';

import { EditableFormFields } from './editable-card/EditableFormFields';
import { RawDataDisclosure } from './editable-card/RawDataDisclosure';
import { EntitySelect } from './EntitySelect';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionType } from '../../lib/transaction-type';

interface EditableTransactionCardProps {
  transaction: ProcessedTransaction;
  onSave: (
    transaction: ProcessedTransaction,
    editedFields: Partial<ProcessedTransaction>,
    shouldLearn?: boolean
  ) => void;
  onCancel: () => void;
  entities?: Array<{ id: string; name: string }>;
}

function parseRaw(rawRow: string): Record<string, string> {
  try {
    return JSON.parse(rawRow);
  } catch {
    return { error: 'Failed to parse raw data' };
  }
}

function TransactionTypeSelect({
  value,
  onChange,
}: {
  value: TransactionType;
  onChange: (next: TransactionType) => void;
}) {
  return (
    <div className="mb-4 p-3 bg-info/10 rounded-lg">
      <Label htmlFor="transactionType" className="block mb-2 font-semibold">
        Transaction Type
      </Label>
      <UiSelect
        id="transactionType"
        name="type"
        value={value}
        onChange={(e) => onChange(e.target.value as TransactionType)}
        options={[
          { label: 'Expense (requires entity)', value: 'purchase' },
          { label: 'Transfer (between accounts, no entity)', value: 'transfer' },
          { label: 'Income (salary, refund, etc.)', value: 'income' },
        ]}
      />
      <p className="text-xs mt-1 text-info">
        {value === 'transfer' &&
          "Transfers don't need an entity - they move money between accounts"}
        {value === 'income' && 'Income transactions: salary, interest, refunds, etc.'}
        {value === 'purchase' && 'Expenses require an entity (merchant/payee)'}
      </p>
    </div>
  );
}

function EditActions({
  onSave,
  onCancel,
}: {
  onSave: (shouldLearn: boolean) => void;
  onCancel: () => void;
}) {
  return (
    <>
      <Button
        variant="default"
        size="sm"
        onClick={() => onSave(true)}
        className="bg-app-accent text-app-accent-foreground hover:bg-app-accent/90"
      >
        <Save className="w-4 h-4 mr-1" />
        Save & Learn
      </Button>
      <Button variant="outline" size="sm" onClick={() => onSave(false)}>
        <Save className="w-4 h-4 mr-1" />
        Save Once
      </Button>
      <Button variant="outline" size="sm" onClick={onCancel}>
        <X className="w-4 h-4 mr-1" />
        Cancel
      </Button>
    </>
  );
}

function EntityOrTransferNotice({
  transactionType,
  entity,
  onEntityChange,
  entities,
}: {
  transactionType: TransactionType;
  entity: ProcessedTransaction['entity'] | undefined;
  onEntityChange: (entityId: string, entityName: string) => void;
  entities?: Array<{ id: string; name: string }>;
}) {
  if (transactionType === 'purchase' && entities && entities.length > 0) {
    return (
      <div className="space-y-2 mb-4">
        <Label htmlFor="entity">Entity (Merchant/Payee)</Label>
        <EntitySelect
          entities={entities}
          value={entity?.entityId ?? ''}
          onChange={onEntityChange}
          placeholder="Select entity..."
        />
      </div>
    );
  }
  if (transactionType === 'transfer') {
    return (
      <div className="p-3 bg-muted rounded-lg mb-4 text-sm">
        <p className="text-foreground">
          💡 <strong>Transfer transactions</strong> don't require an entity. They represent money
          moving between your accounts (e.g., credit card payments, savings transfers).
        </p>
      </div>
    );
  }
  return null;
}

/**
 * Inline editing form for transaction fields
 */
export function EditableTransactionCard({
  transaction,
  onSave,
  onCancel,
  entities,
}: EditableTransactionCardProps) {
  const [editedFields, setEditedFields] = useState<Partial<ProcessedTransaction>>({
    description: transaction.description,
    amount: transaction.amount,
    date: transaction.date,
    location: transaction.location ?? '',
    account: transaction.account,
    transactionType: transaction.transactionType ?? 'purchase',
    entity: transaction.entity,
  });

  const transactionType = editedFields.transactionType ?? 'purchase';
  const rawData = parseRaw(transaction.rawRow);

  const handleSave = (shouldLearn = false) => onSave(transaction, editedFields, shouldLearn);
  const handleEntityChange = (entityId: string, entityName: string) =>
    setEditedFields({ ...editedFields, entity: { entityId, entityName, matchType: 'manual' } });

  return (
    <EditableFormCard
      title="Edit Transaction"
      actions={<EditActions onSave={handleSave} onCancel={onCancel} />}
      onEscape={onCancel}
    >
      <TransactionTypeSelect
        value={transactionType}
        onChange={(next) => setEditedFields({ ...editedFields, transactionType: next })}
      />
      <EditableFormFields editedFields={editedFields} setEditedFields={setEditedFields} />
      <EntityOrTransferNotice
        transactionType={transactionType}
        entity={editedFields.entity}
        onEntityChange={handleEntityChange}
        entities={entities}
      />
      <RawDataDisclosure rawData={rawData} />
    </EditableFormCard>
  );
}
