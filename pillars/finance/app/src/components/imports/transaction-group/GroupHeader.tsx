import { ChevronRight, Sparkles } from 'lucide-react';

import { Badge, Button, CollapsibleTrigger } from '@pops/ui';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionGroup as TransactionGroupType } from '../../../lib/transaction-utils';

interface GroupBulkActionsProps {
  group: TransactionGroupType;
  entityExists?: boolean;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onToggleEntitySelector: () => void;
}

/**
 * "Accept All" takes the AI's guess as-is; everything else — picking a
 * different existing merchant or naming one that doesn't exist yet — is the
 * single picker behind "Assign all". Choosing and creating were two buttons
 * leading to two surfaces for what is one decision.
 */
function GroupBulkActions(props: GroupBulkActionsProps) {
  const { group, entityExists, onAcceptAll, onToggleEntitySelector } = props;
  return (
    <div className="flex gap-2">
      {group.aiSuggestion && (
        <Button
          variant="default"
          size="sm"
          onClick={() => onAcceptAll(group.transactions)}
          className="bg-app-accent text-app-accent-foreground hover:bg-app-accent/90"
        >
          {entityExists ? '✓' : '+'} Accept All as "{group.entityName}"
        </Button>
      )}
      <Button variant="outline" size="sm" onClick={onToggleEntitySelector}>
        Assign all...
      </Button>
    </div>
  );
}

export interface GroupHeaderProps extends GroupBulkActionsProps {
  isExpanded: boolean;
  totalAmount: number;
}

export function GroupHeader(props: GroupHeaderProps) {
  const { group, isExpanded, totalAmount } = props;
  return (
    <div className={`p-4 ${group.aiSuggestion ? 'bg-app-accent/10' : 'bg-muted'}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <CollapsibleTrigger
            className="flex items-center gap-2 hover:opacity-80 transition-opacity min-w-0 w-full"
            aria-label={isExpanded ? 'Collapse' : 'Expand'}
          >
            <ChevronRight
              className={`w-5 h-5 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              aria-hidden="true"
            />
            <div className="flex items-center gap-2 min-w-0">
              {group.aiSuggestion && <Sparkles className="w-5 h-5 shrink-0 text-app-accent" />}
              <h3 className="font-semibold text-lg truncate">{group.entityName}</h3>
            </div>
          </CollapsibleTrigger>
          <div className="flex items-center gap-3 mt-2 ml-7">
            <Badge variant="secondary">
              {group.transactions.length} transaction
              {group.transactions.length !== 1 ? 's' : ''}
            </Badge>
            <span className="text-sm text-muted-foreground">Total: ${totalAmount.toFixed(2)}</span>
            {group.category && (
              <Badge variant="outline" className="text-xs">
                {group.category}
              </Badge>
            )}
          </div>
        </div>
        <GroupBulkActions {...props} />
      </div>
    </div>
  );
}
