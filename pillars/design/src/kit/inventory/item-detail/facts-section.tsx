/**
 * The item's facts: its type's fields and, for a group, its quantity. Each
 * fact edits in place. An untyped item says why it has no fields and offers
 * the one step that gives it some.
 */
import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../foundation';
import { FactRow } from './fact-row';
import { EmptyLine } from './section-parts';

import type { DetailCondition, DetailFact } from './detail-model';
import type { FactPhase } from './fact-row';

/** Props for {@link FactsSection}. */
export interface FactsSectionProps {
  facts: readonly DetailFact[];
  typeName: string | null;
  condition?: DetailCondition;
  /** `grid` sits two-up beside the photo; `list` is one per line in a rail. */
  layout?: 'grid' | 'list';
  readOnly?: boolean;
  onEdit?: (key: string) => void;
  onQuantity?: (action: 'split' | 'change') => void;
}

const NO_CONDITION: DetailCondition = {};

function phaseOf(key: string, condition: DetailCondition): FactPhase {
  if (condition.savingKey === key) return 'saving';
  if (condition.editingKey === key) return 'editing';
  if (condition.pendingKey === key) return 'pending';
  if (condition.rejection?.key === key) return 'rejected';
  return 'idle';
}

function NoFacts({ typeName }: { typeName: string | null }) {
  if (typeName === null) {
    return (
      <EmptyLine
        icon={INVENTORY_ICONS.type}
        text="Untyped, so it has no fields yet."
        actionLabel="Set type"
      />
    );
  }
  return (
    <EmptyLine icon={INVENTORY_ICONS.type} text={`${typeName} has no fields beyond the name.`} />
  );
}

/** The facts block. */
export function FactsSection({
  facts,
  typeName,
  condition = NO_CONDITION,
  layout = 'grid',
  readOnly = false,
  onEdit,
  onQuantity,
}: FactsSectionProps) {
  if (facts.length === 0) return <NoFacts typeName={typeName} />;
  return (
    <div
      role="group"
      aria-label="Facts"
      className={cn(
        'grid min-w-0 content-start gap-x-2 gap-y-0.5',
        layout === 'grid' ? 'grid-cols-1 @xs:grid-cols-2 @lg:grid-cols-3' : 'grid-cols-1'
      )}
    >
      {facts.map((fact) => (
        <FactRow
          key={fact.key}
          fact={fact}
          phase={phaseOf(fact.key, condition)}
          draft={condition.editingKey === fact.key ? condition.editingDraft : undefined}
          rejection={condition.rejection?.key === fact.key ? condition.rejection.reason : undefined}
          readOnly={readOnly}
          onEdit={onEdit}
          onQuantity={onQuantity}
          inlineLabel={layout === 'list'}
        />
      ))}
    </div>
  );
}
