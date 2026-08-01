import { Sparkles } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { EntitySelect } from '../EntitySelect';

import type { ProcessedTransaction } from '@pops/finance';

interface AiSuggestionProps {
  transaction: ProcessedTransaction;
  aiSuggestedEntityExists: boolean;
  onAcceptAiSuggestion: (transaction: ProcessedTransaction) => void;
}

function AiSuggestionPanel({
  transaction,
  aiSuggestedEntityExists,
  onAcceptAiSuggestion,
}: AiSuggestionProps) {
  return (
    <div className="mb-2 p-2 bg-app-accent/10 rounded-md border border-app-accent/20">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-app-accent" />
        <span className="text-sm text-app-accent">
          AI suggestion: {transaction.entity?.entityName}
        </span>
      </div>
      <Button
        variant="default"
        size="sm"
        onClick={() => onAcceptAiSuggestion(transaction)}
        className="bg-app-accent text-app-accent-foreground hover:bg-app-accent/90 w-full"
      >
        {aiSuggestedEntityExists ? '✓' : '+'} Accept "{transaction.entity?.entityName}"
      </Button>
    </div>
  );
}

interface EntitySectionProps {
  transaction: ProcessedTransaction;
  entities?: Array<{ id: string; name: string }>;
  onEntitySelect?: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string
  ) => void;
  /** Create a new entity named after the picker's search term and assign it. */
  onCreateEntityWithName?: (transaction: ProcessedTransaction, entityName: string) => void;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
}

/**
 * Entity assignment for one transaction: the AI suggestion (when there is one)
 * plus a single picker that both selects an existing entity and creates a new
 * one from the search term. Creation lives inside the picker so a wrong
 * auto-match is fixable to a merchant that doesn't exist yet — the separate
 * "Create new" buttons only appeared when the AI's guess was itself missing,
 * which is exactly when the fix wasn't needed.
 */
export function EntitySection(props: EntitySectionProps) {
  const { transaction, entities, onEntitySelect, onCreateEntityWithName, onAcceptAiSuggestion } =
    props;
  const hasAiSuggestion = transaction.entity?.matchType === 'ai' && transaction.entity?.entityName;
  const aiSuggestedEntityExists = Boolean(
    hasAiSuggestion &&
    entities?.some((e) => e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase())
  );
  return (
    <div className="mb-3">
      {hasAiSuggestion && onAcceptAiSuggestion && (
        <AiSuggestionPanel
          transaction={transaction}
          aiSuggestedEntityExists={aiSuggestedEntityExists}
          onAcceptAiSuggestion={onAcceptAiSuggestion}
        />
      )}
      <EntitySelect
        entities={entities ?? []}
        value={transaction.entity?.entityId ?? ''}
        onChange={(entityId, entityName) => onEntitySelect?.(transaction, entityId, entityName)}
        onCreate={
          onCreateEntityWithName
            ? (entityName) => onCreateEntityWithName(transaction, entityName)
            : undefined
        }
      />
    </div>
  );
}

export function ReadonlyEntitySummary({
  transaction,
  showMatchType,
}: {
  transaction: ProcessedTransaction;
  showMatchType: boolean;
}) {
  if (!transaction.entity?.entityName) return null;
  return (
    <div className="mb-3">
      <div className="text-sm">
        <span className="text-muted-foreground">Entity:</span>{' '}
        <span className="font-medium">{transaction.entity.entityName}</span>
      </div>
      {showMatchType && (
        <Badge variant="secondary" className="text-xs mt-1">
          {transaction.entity.matchType}
        </Badge>
      )}
    </div>
  );
}
