import { cn } from '@pops/ui';

import { EmptyLine } from '../../foundation/item-page/section-parts';
import { INVENTORY_ICONS } from '../../foundation/model/icons';
import { FactRow } from './fact-row';

import type { ReactElement } from 'react';

import type { DetailFact } from './detail-model';

/** Props for the read-only facts block. */
export interface FactsSectionProps {
  facts: readonly DetailFact[];
  typeName: string | null;
  layout?: 'grid' | 'list';
  readOnly?: boolean;
  onSetType?: () => void;
  onQuantity?: (action: 'split' | 'change') => void;
}

function NoFacts({
  typeName,
  readOnly,
  onSetType,
}: Pick<FactsSectionProps, 'typeName' | 'readOnly' | 'onSetType'>): ReactElement {
  if (typeName === null) {
    return (
      <EmptyLine
        icon={INVENTORY_ICONS.type}
        text="Untyped, so it has no fields yet."
        actionLabel={readOnly ? undefined : 'Set type'}
        onAction={readOnly ? undefined : onSetType}
      />
    );
  }
  return (
    <EmptyLine icon={INVENTORY_ICONS.type} text={`${typeName} has no fields beyond the name.`} />
  );
}

/** Renders the facts rail in list or wider grid form. */
export function FactsSection({
  facts,
  typeName,
  layout = 'grid',
  readOnly = false,
  onSetType,
}: FactsSectionProps): ReactElement {
  if (facts.length === 0)
    return <NoFacts typeName={typeName} readOnly={readOnly} onSetType={onSetType} />;
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
        <FactRow key={fact.key} fact={fact} readOnly={readOnly} inlineLabel={layout === 'list'} />
      ))}
    </div>
  );
}
