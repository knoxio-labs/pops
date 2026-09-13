import { AlertTriangle, ChevronRight, Sparkles } from 'lucide-react';

import { Badge, Button, CollapsibleTrigger } from '@pops/ui';

import { AcceptEntityButton } from '../AcceptEntityButton';
import { type EntityExistence } from '../entity-existence';
import { dropReason } from '../review/buildConfirmed';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionGroup as TransactionGroupType } from '../../../lib/transaction-utils';

export type GroupVariant = 'matched' | 'uncertain' | 'failed';

interface GroupBulkActionsProps {
  group: TransactionGroupType;
  existence: EntityExistence;
  variant: GroupVariant;
  onAcceptAll: (transactions: ProcessedTransaction[]) => void;
  onToggleEntitySelector: () => void;
}

/**
 * The accept button takes the AI's guess as-is; everything else — picking a
 * different existing merchant or naming one that doesn't exist yet — is the
 * single picker behind "Choose entity". Choosing and creating were two buttons
 * leading to two surfaces for what is one decision.
 *
 * A matched group has nothing left to accept — its rows already carry the
 * entity in the header — so the only action is to move the whole group
 * somewhere else (POPS-2448).
 */
function GroupBulkActions(props: GroupBulkActionsProps) {
  const { group, existence, variant, onAcceptAll, onToggleEntitySelector } = props;
  const matched = variant === 'matched';
  return (
    <div className="flex gap-2">
      {!matched && group.aiSuggestion && (
        <AcceptEntityButton
          existence={existence}
          scope="all"
          entityName={group.entityName}
          onClick={() => onAcceptAll(group.transactions)}
        />
      )}
      <Button variant="outline" size="sm" onClick={onToggleEntitySelector}>
        {matched ? 'Reassign all...' : 'Choose entity...'}
      </Button>
    </div>
  );
}

export interface GroupHeaderProps extends GroupBulkActionsProps {
  isExpanded: boolean;
  totalAmount: number;
}

/**
 * How many of the group's rows will not commit. Collapsed groups are the
 * default in the Matched tab, so without this the only sign of a blocked row
 * is a count above the tabs that names no group (POPS-3659).
 */
function blockedCount(props: GroupHeaderProps): number {
  if (props.variant !== 'matched') return 0;
  return props.group.transactions.filter((t) => dropReason(t) !== null).length;
}

export function GroupHeader(props: GroupHeaderProps) {
  const { group, isExpanded, totalAmount } = props;
  const blocked = blockedCount(props);
  return (
    <div
      className={`p-4 ${group.aiSuggestion && props.variant !== 'matched' ? 'bg-app-accent/10' : 'bg-muted'}`}
    >
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
              {group.aiSuggestion && props.variant !== 'matched' && (
                <Sparkles className="w-5 h-5 shrink-0 text-app-accent" />
              )}
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
            {blocked > 0 && (
              <Badge
                variant="outline"
                className="text-xs gap-1 border-warning/40 bg-warning/10 text-warning"
              >
                <AlertTriangle className="w-3 h-3" aria-hidden="true" />
                {blocked} won&apos;t import
              </Badge>
            )}
          </div>
        </div>
        <GroupBulkActions {...props} />
      </div>
    </div>
  );
}
