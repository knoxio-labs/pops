import { AlertTriangle, Sparkles } from 'lucide-react';

import { Badge } from '@pops/ui';

import { AcceptEntityButton } from '../AcceptEntityButton';
import {
  type EntityExistence,
  resolveEntityExistence,
  type EntityVerification,
} from '../entity-existence';
import { EntitySelect } from '../EntitySelect';
import {
  classifyAssignedEntity,
  isUnresolvedEntity,
  type UnresolvedEntityState,
} from '../lib/assigned-entity';
import { needsTransactionType } from '../review/buildConfirmed';
import { ForcedTypePrompt } from './ForcedTypePrompt';
import { usePendingTypedAssignment } from './usePendingTypedAssignment';

import type { ProcessedTransaction } from '@pops/finance';

import type { TransactionType } from '../../../lib/transaction-type';

interface AiSuggestionProps {
  transaction: ProcessedTransaction;
  entityName: string;
  existence: EntityExistence;
  onAcceptAiSuggestion: (transaction: ProcessedTransaction) => void;
}

function AiSuggestionPanel({
  transaction,
  entityName,
  existence,
  onAcceptAiSuggestion,
}: AiSuggestionProps) {
  return (
    <div className="mb-2 p-2 bg-app-accent/10 rounded-md border border-app-accent/20">
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="w-4 h-4 text-app-accent" />
        <span className="text-sm text-app-accent">AI suggestion: {entityName}</span>
      </div>
      <AcceptEntityButton
        existence={existence}
        scope="one"
        entityName={entityName}
        onClick={() => onAcceptAiSuggestion(transaction)}
        className="w-full"
      />
    </div>
  );
}

/**
 * What each cause means and what to do about it. Two causes, two actions: a
 * placeholder was never a contact and needs one chosen, while a missing id was
 * one and is not any more.
 */
const UNRESOLVED_ENTITY_MESSAGE: Record<UnresolvedEntityState, (named: string) => string> = {
  'never-created': (named) =>
    `${named} was never created in contacts, so this row has no usable merchant. Pick one to fix it.`,
  missing: (named) => `${named} no longer exists in contacts. Pick a replacement.`,
};

/**
 * Says which entity the row is carrying when the picker cannot show it.
 *
 * Without this the picker falls back to "Choose entity…" — the same thing it
 * shows for a row with no entity at all — so a rule that matched and assigned
 * a merchant reads as a rule that assigned nothing, and the fix is never
 * prompted (POPS-2692).
 */
function UnresolvedEntityNotice({
  state,
  entityName,
}: {
  state: UnresolvedEntityState;
  entityName: string | undefined;
}) {
  const named = entityName ? `“${entityName}”` : 'this row\u2019s entity';
  return (
    <div
      role="status"
      className="mb-2 p-2 rounded-md border flex items-start gap-2 text-xs text-warning bg-warning/10 border-warning/25"
    >
      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden="true" />
      <span>{UNRESOLVED_ENTITY_MESSAGE[state](named)}</span>
    </div>
  );
}

interface EntitySectionProps {
  transaction: ProcessedTransaction;
  entities?: Array<{ id: string; name: string }>;
  entityVerification?: EntityVerification;
  onEntitySelect?: (
    transaction: ProcessedTransaction,
    entityId: string,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  /** Create a new entity named after the picker's search term and assign it. */
  onCreateEntityWithName?: (
    transaction: ProcessedTransaction,
    entityName: string,
    transactionType?: TransactionType
  ) => void;
  onAcceptAiSuggestion?: (transaction: ProcessedTransaction) => void;
}

type TypedEntityPickerProps = Pick<
  EntitySectionProps,
  'transaction' | 'entities' | 'onEntitySelect' | 'onCreateEntityWithName'
>;

/**
 * The picker itself, plus the forced-type prompt for a credit with no type
 * yet (POPS-2754) — `moveOneToMatched` would otherwise carry the row into
 * `matched` still untyped. Split out of `EntitySection` to keep the pending-
 * assignment state machine's branching out of the parent component.
 */
function TypedEntityPicker({
  transaction,
  entities,
  onEntitySelect,
  onCreateEntityWithName,
}: TypedEntityPickerProps) {
  const forceType = needsTransactionType(transaction);
  const { pending, type, setType, request, cancel, confirm } = usePendingTypedAssignment(
    (assignment, chosenType) =>
      assignment.kind === 'select'
        ? onEntitySelect?.(transaction, assignment.entityId, assignment.entityName, chosenType)
        : onCreateEntityWithName?.(transaction, assignment.entityName, chosenType)
  );

  return (
    <>
      <EntitySelect
        entities={entities ?? []}
        value={pending?.kind === 'select' ? pending.entityId : (transaction.entity?.entityId ?? '')}
        onChange={(entityId, entityName) => {
          if (forceType) {
            request({ kind: 'select', entityId, entityName });
            return;
          }
          onEntitySelect?.(transaction, entityId, entityName);
        }}
        onCreate={
          onCreateEntityWithName
            ? (entityName) => {
                if (forceType) {
                  request({ kind: 'create', entityName });
                  return;
                }
                onCreateEntityWithName(transaction, entityName);
              }
            : undefined
        }
      />
      {pending && (
        <ForcedTypePrompt
          message={`This is a credit with no type yet — choose one to finish assigning “${pending.entityName}”.`}
          type={type}
          onTypeChange={setType}
          onConfirm={confirm}
          onCancel={cancel}
        />
      )}
    </>
  );
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
  const {
    transaction,
    entities,
    entityVerification = 'checking',
    onEntitySelect,
    onCreateEntityWithName,
    onAcceptAiSuggestion,
  } = props;
  const suggestedName =
    transaction.entity?.matchType === 'ai' ? transaction.entity.entityName : undefined;
  const assigned = classifyAssignedEntity(transaction, entities);

  return (
    <div className="mb-3">
      {suggestedName && onAcceptAiSuggestion && (
        <AiSuggestionPanel
          transaction={transaction}
          entityName={suggestedName}
          existence={resolveEntityExistence(suggestedName, entities, entityVerification)}
          onAcceptAiSuggestion={onAcceptAiSuggestion}
        />
      )}
      {isUnresolvedEntity(assigned) && (
        <UnresolvedEntityNotice state={assigned} entityName={transaction.entity?.entityName} />
      )}
      <TypedEntityPicker
        transaction={transaction}
        entities={entities}
        onEntitySelect={onEntitySelect}
        onCreateEntityWithName={onCreateEntityWithName}
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
