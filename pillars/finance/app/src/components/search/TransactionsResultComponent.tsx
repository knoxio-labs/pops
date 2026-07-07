import { registerResultComponent } from '@pops/navigation';
import { Badge, formatCurrency, formatDate, highlightMatch, SearchResultItem } from '@pops/ui';

import { labelForType, tileForType, type StatTile } from '../../lib/transaction-type';

import type { ResultComponentProps } from '@pops/navigation';

interface TransactionHitData extends Record<string, unknown> {
  description: string;
  amount: number;
  date: string;
  entityName: string | null;
  type: string;
}

/**
 * Colour + sign per dashboard tile bucket, so global search reads the 8-type
 * taxonomy exactly as the StatsGrid does (#3757): expense-bucket types (incl.
 * refund/reversal, which offset expenses) render red with `-`, income-bucket
 * types green with `+`, and transfers/unknowns muted with no sign.
 */
const TILE_DISPLAY: Record<StatTile, { color: string; sign: string }> = {
  income: { color: 'text-success', sign: '+' },
  expense: { color: 'text-destructive', sign: '-' },
  excluded: { color: 'text-muted-foreground', sign: '' },
};

export function TransactionsResultComponent({
  data,
  query,
  matchField,
}: ResultComponentProps<TransactionHitData>) {
  const shouldHighlight = matchField === 'description' && query;
  const display = TILE_DISPLAY[tileForType(data.type)];

  return (
    <SearchResultItem
      title={shouldHighlight ? highlightMatch(data.description, query) : data.description}
      meta={[
        data.entityName ? <span key="entity">{data.entityName}</span> : null,
        <Badge key="type" variant="outline" className="text-2xs uppercase tracking-wider shrink-0">
          {labelForType(data.type)}
        </Badge>,
      ]}
      trailing={
        <div className="flex flex-col items-end shrink-0">
          <span className={`text-sm font-medium ${display.color}`}>
            {display.sign}
            {formatCurrency(Math.abs(data.amount), {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </span>
          <span className="text-xs text-muted-foreground">{formatDate(data.date)}</span>
        </div>
      }
    />
  );
}

registerResultComponent('transactions', TransactionsResultComponent);
