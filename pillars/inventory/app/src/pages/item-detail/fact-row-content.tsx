import { LoaderCircle } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../../foundation/model/icons';

import type { ReactElement, ReactNode } from 'react';

import type { DetailFact } from './detail-model';
import type { FactPhase } from './use-fact-editing';

/** Props for the presentational portion of a fact row. */
export interface FactRowContentProps {
  fact: DetailFact;
  inlineLabel: boolean;
  editing: boolean;
  editable: boolean;
  phase: FactPhase;
  editor: ReactNode;
  onEdit: ((key: string) => void) | undefined;
  onQuantity: ((action: 'split' | 'change') => void) | undefined;
  rejection: string | undefined;
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

function QuantityActions({ onQuantity }: Pick<FactRowContentProps, 'onQuantity'>): ReactElement {
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <Button type="button" variant="ghost" size="sm" onClick={() => onQuantity?.('split')}>
        Split
      </Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => onQuantity?.('change')}>
        Change
      </Button>
    </span>
  );
}

function FactRowValue({
  fact,
  editing,
  editable,
  phase,
  editor,
  onEdit,
  onQuantity,
}: Pick<
  FactRowContentProps,
  'fact' | 'editing' | 'editable' | 'phase' | 'editor' | 'onEdit' | 'onQuantity'
>): ReactElement {
  if (editing) {
    return (
      <div className="w-full min-w-0 text-sm">
        <fieldset disabled={phase === 'saving'}>{editor}</fieldset>
        {phase === 'saving' ? (
          <LoaderCircle
            className="mt-1 size-3.5 animate-spin text-muted-foreground"
            aria-label="Saving"
          />
        ) : null}
      </div>
    );
  }
  return (
    <span className="flex w-full min-w-0 items-baseline gap-1.5 text-sm">
      {editable ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="min-w-0 truncate text-left hover:underline"
          aria-label={`Edit ${fact.label}`}
          onClick={() => onEdit?.(fact.key)}
        >
          <FactValue fact={fact} />
        </Button>
      ) : (
        <FactValue fact={fact} />
      )}
      <Origin fact={fact} />
      {fact.key === 'quantity' && onQuantity ? <QuantityActions onQuantity={onQuantity} /> : null}
    </span>
  );
}

/** Renders fact labels, values, quantity verbs, editors, and rejection copy. */
export function FactRowContent({
  fact,
  inlineLabel,
  editing,
  editable,
  phase,
  editor,
  onEdit,
  onQuantity,
  rejection,
}: FactRowContentProps): ReactElement {
  return (
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
      <FactRowValue
        fact={fact}
        editing={editing}
        editable={editable}
        phase={phase}
        editor={editor}
        onEdit={onEdit}
        onQuantity={onQuantity}
      />
      {rejection ? (
        <p className="text-xs text-destructive">
          Not saved. {rejection} It went back to {fact.value ?? 'Not set'}.
        </p>
      ) : null}
    </span>
  );
}
