import { AlertTriangle } from 'lucide-react';

import { dropReason } from './review/buildConfirmed';
import { dropReasonCopy } from './review/drop-reason-copy';
import {
  CardHeader,
  FieldGrid,
  getCardClasses,
  parseRawData,
  RawDataSection,
} from './transaction-card/CardChrome';
import { EntitySection, ReadonlyEntitySummary } from './transaction-card/EntitySection';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionType } from '../../lib/transaction-type';
import type { EntityVerification } from './entity-existence';

interface TransactionCardProps {
  transaction: ProcessedTransaction;
  onEntitySelect?: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  onCreateEntityWithName?: (
    transaction: ProcessedTransaction,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
  onEdit?: (transaction: ProcessedTransaction) => void;
  entities?: Array<{ id: string; name: string }>;
  entityVerification?: EntityVerification;
  readonly?: boolean;
  showMatchType?: boolean;
  variant?: 'matched' | 'uncertain' | 'failed';
}

/**
 * Reusable transaction card component with expandable raw data
 */
export function TransactionCard({
  transaction,
  onEntitySelect,
  onCreateEntityWithName,
  onAcceptAiSuggestion,
  onEdit,
  entities,
  entityVerification,
  readonly = false,
  showMatchType = false,
  variant = 'matched',
}: TransactionCardProps) {
  // A matched row that cannot commit looks exactly like one that can, and the
  // count above the tabs could not say which of a few hundred it meant. The
  // row carries its own verdict instead (POPS-3659).
  const blocked = variant === 'matched' && !readonly ? dropReason(transaction) : null;
  const { border, bg } = blocked
    ? { border: 'border-warning/60', bg: 'bg-warning/10' }
    : getCardClasses(variant);
  const rawData = parseRawData(transaction.rawRow);
  return (
    <div
      className={`border rounded-lg p-4 ${border} ${bg}`}
      data-testid="transaction-card"
      data-blocked={blocked ?? undefined}
      aria-label={transaction.description}
    >
      <CardHeader transaction={transaction} onEdit={onEdit} readonly={readonly} />
      {blocked && (
        <p className="flex items-center gap-1.5 mb-3 text-xs font-medium text-warning">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" aria-hidden="true" />
          Won&apos;t be imported: {dropReasonCopy[blocked].label}
        </p>
      )}
      <FieldGrid transaction={transaction} />
      {!readonly && (
        <EntitySection
          transaction={transaction}
          entities={entities}
          entityVerification={entityVerification}
          onEntitySelect={onEntitySelect}
          onCreateEntityWithName={onCreateEntityWithName}
          onAcceptAiSuggestion={onAcceptAiSuggestion}
        />
      )}
      {readonly && (
        <ReadonlyEntitySummary transaction={transaction} showMatchType={showMatchType} />
      )}
      {transaction.error && (
        <div className="text-sm text-destructive mb-3">{transaction.error}</div>
      )}
      <RawDataSection rawData={rawData} />
    </div>
  );
}
