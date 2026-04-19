import { registerResultComponent } from '@pops/navigation';
import { formatCurrency, formatDate, highlightMatch } from '@pops/ui';

import type { ResultComponentProps } from '@pops/navigation';

interface TransactionData {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: 'income' | 'expense' | 'transfer';
}

function amountColorClass(type: 'income' | 'expense' | 'transfer'): string {
  switch (type) {
    case 'income':
      return 'text-success';
    case 'expense':
      return 'text-destructive';
    case 'transfer':
      return 'text-muted-foreground';
  }
}

export function TransactionsResultComponent({ data, query, matchField }: ResultComponentProps) {
  const tx = data as unknown as TransactionData;
  const shouldHighlight = matchField === 'description' && query;

  return (
    <div className="flex items-center justify-between gap-2 min-w-0">
      <div className="flex flex-col min-w-0">
        <span className="text-sm font-medium truncate">
          {shouldHighlight ? highlightMatch(tx.description, query) : tx.description}
        </span>
        {tx.entityName && (
          <span className="text-xs text-muted-foreground truncate">{tx.entityName}</span>
        )}
      </div>
      <div className="flex flex-col items-end shrink-0">
        <span className={`text-sm font-medium ${amountColorClass(tx.type)}`}>
          {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
          {formatCurrency(Math.abs(tx.amount), {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}
        </span>
        <span className="text-xs text-muted-foreground">{formatDate(tx.date)}</span>
      </div>
    </div>
  );
}

registerResultComponent('transactions', TransactionsResultComponent);
