import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons';

import type { ReactElement } from 'react';

import type { DetailFact } from './detail-model';

/** Props for one read-only fact row. */
export interface FactRowProps {
  fact: DetailFact;
  readOnly?: boolean;
  onQuantity?: (action: 'split' | 'change') => void;
  inlineLabel?: boolean;
}

function FactValue({ fact }: { fact: DetailFact }): ReactElement {
  if (fact.origin === 'missing-inputs') {
    return (
      <span className="truncate text-muted-foreground">
        Needs {(fact.missingInputs ?? []).join(', ')}
      </span>
    );
  }
  if (fact.value === null) return <span className="text-muted-foreground">Not set</span>;
  return (
    <span className={cn('truncate text-foreground', fact.mono && 'font-mono')}>{fact.value}</span>
  );
}

function Origin({ fact }: { fact: DetailFact }): ReactElement | null {
  if (fact.origin === 'entered') return null;
  const Icon = INVENTORY_ICONS.computed;
  const label = fact.origin === 'missing-inputs' ? 'Calculated' : fact.origin;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {label.charAt(0).toUpperCase() + label.slice(1)}
    </span>
  );
}

/** Renders one fact in read mode; editing belongs to the next item-page ticket. */
export function FactRow({ fact, inlineLabel = false }: FactRowProps): ReactElement {
  return (
    <div className="flex min-h-11 min-w-0 items-center gap-2 rounded-md px-2 py-1">
      <span
        className={cn(
          'flex min-w-0 flex-1 text-left',
          inlineLabel
            ? 'flex-row items-center justify-start gap-2'
            : 'flex-col items-start justify-center gap-0'
        )}
      >
        <span
          className={cn(
            'truncate text-left text-xs text-muted-foreground',
            inlineLabel ? 'w-32 shrink-0' : 'w-full'
          )}
        >
          {fact.label}
        </span>
        <span className="flex w-full min-w-0 items-baseline gap-1.5 text-sm">
          <FactValue fact={fact} />
          <Origin fact={fact} />
        </span>
      </span>
    </div>
  );
}
