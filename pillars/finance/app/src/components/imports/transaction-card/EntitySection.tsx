import { Sparkles } from 'lucide-react';

import { Badge, Button } from '@pops/ui';

import { EntitySelect } from '../EntitySelect';

import type { ProcessedTransaction } from '@pops/finance';

interface AiSuggestionProps {
  transaction: ProcessedTransaction;
  aiSuggestedEntityExists: boolean;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
  onCreateEntity?: (transaction: ProcessedTransaction) => void;
}

function AiSuggestionPanel({
  transaction,
  aiSuggestedEntityExists,
  onAcceptAiSuggestion,
  onCreateEntity,
}: AiSuggestionProps) {
  return (
    <div className="mb-2 p-2 bg-app-accent/10 rounded-md border border-app-accent/20">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-app-accent" />
        <span className="text-sm text-app-accent">
          AI suggestion: {transaction.entity?.entityName}
        </span>
      </div>
      <div className="flex gap-2">
        {onAcceptAiSuggestion && (
          <Button
            variant="default"
            size="sm"
            onClick={() => onAcceptAiSuggestion(transaction)}
            className="bg-app-accent text-app-accent-foreground hover:bg-app-accent/90 flex-1"
          >
            {aiSuggestedEntityExists ? '✓' : '+'} Accept "{transaction.entity?.entityName}"
          </Button>
        )}
        {onCreateEntity && !aiSuggestedEntityExists && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onCreateEntity(transaction)}
            className="flex-1"
          >
            Create new
          </Button>
        )}
      </div>
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
  onCreateEntity?: (transaction: ProcessedTransaction) => void;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
}

export function EntitySection(props: EntitySectionProps) {
  const { transaction, entities, onEntitySelect, onCreateEntity, onAcceptAiSuggestion } = props;
  const hasAiSuggestion = transaction.entity?.matchType === 'ai' && transaction.entity?.entityName;
  const aiSuggestedEntityExists = Boolean(
    hasAiSuggestion &&
    entities?.some((e) => e.name.toLowerCase() === transaction.entity?.entityName?.toLowerCase())
  );
  return (
    <div className="mb-3">
      {hasAiSuggestion && (
        <AiSuggestionPanel
          transaction={transaction}
          aiSuggestedEntityExists={aiSuggestedEntityExists}
          onAcceptAiSuggestion={onAcceptAiSuggestion}
          onCreateEntity={onCreateEntity}
        />
      )}
      {!hasAiSuggestion && onCreateEntity && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => onCreateEntity(transaction)}
          className="w-full mb-2"
        >
          + Create new entity
        </Button>
      )}
      <EntitySelect
        entities={entities ?? []}
        value={transaction.entity?.entityId ?? ''}
        onChange={(entityId, entityName) => onEntitySelect?.(transaction, entityId, entityName)}
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
