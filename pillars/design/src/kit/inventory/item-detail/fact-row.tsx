/**
 * One fact, edited where it sits (spec 3.4): click or Enter opens it, Enter
 * saves, Esc reverts. A save shows in the fact itself: a spinner while the
 * request is out, the accent edge while it is applied but unacknowledged,
 * and the server's reason in place when it refuses. Computed facts read like
 * any other property, with one word saying where the number came from.
 */
import { LoaderCircle } from 'lucide-react';

import { ButtonPrimitive, Input, cn } from '@pops/ui';

import { INVENTORY_ICONS, KeyCombo } from '../foundation';
import { VerbButton } from './verb-button';

import type { DetailFact } from './detail-model';

/** What is happening to this fact right now. */
export type FactPhase = 'idle' | 'editing' | 'saving' | 'pending' | 'rejected';

/** Props for {@link FactRow}. */
export interface FactRowProps {
  fact: DetailFact;
  phase?: FactPhase;
  draft?: string;
  rejection?: string;
  /** Read-only page (destroyed, offline): no editing affordance at all. */
  readOnly?: boolean;
  onEdit?: (key: string) => void;
  onQuantity?: (action: 'split' | 'change') => void;
  /** Label and value on one line, for narrow rails. */
  inlineLabel?: boolean;
}

const ORIGIN_WORD: Partial<Record<DetailFact['origin'], string>> = {
  calculated: 'Calculated',
  overridden: 'Overridden',
  'missing-inputs': 'Calculated',
};

function FactLabel({ fact, inline = false }: { fact: DetailFact; inline?: boolean }) {
  return (
    <span
      className={cn(
        'truncate text-left text-xs text-muted-foreground',
        inline ? 'w-32 shrink-0' : 'w-full'
      )}
    >
      {fact.label}
    </span>
  );
}

const STACK = 'flex-col items-start justify-center gap-0';
const LINE = 'flex-row items-center justify-start gap-2';

function Origin({ fact }: { fact: DetailFact }) {
  const word = ORIGIN_WORD[fact.origin];
  if (word === undefined) return null;
  const Sigma = INVENTORY_ICONS.computed;
  return (
    <span className="inline-flex shrink-0 items-center gap-0.5 text-2xs text-muted-foreground">
      <Sigma className="size-3" aria-hidden />
      {word}
    </span>
  );
}

function ValueText({ fact }: { fact: DetailFact }) {
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

function FactValue({ fact }: { fact: DetailFact }) {
  return (
    <span className="flex w-full min-w-0 items-baseline gap-1.5 text-left text-sm">
      <ValueText fact={fact} />
      <Origin fact={fact} />
    </span>
  );
}

function Editor({ fact, draft, saving }: { fact: DetailFact; draft: string; saving: boolean }) {
  return (
    <div className="flex flex-col gap-1 px-2 py-1">
      <FactLabel fact={fact} />
      <div className="relative">
        <Input
          aria-label={fact.label}
          defaultValue={draft}
          disabled={saving}
          className="h-8 pr-8 text-sm"
        />
        {saving ? (
          <LoaderCircle
            className="absolute top-1/2 right-2 size-4 -translate-y-1/2 text-muted-foreground motion-safe:animate-spin"
            aria-label="Saving"
          />
        ) : null}
      </div>
      <span className="flex items-center gap-2 text-2xs text-muted-foreground">
        <KeyCombo sequence={['Enter']} /> save
        <KeyCombo sequence={['Escape']} /> revert
      </span>
    </div>
  );
}

function QuantityActions({ onQuantity }: { onQuantity?: FactRowProps['onQuantity'] }) {
  return (
    <span className="ml-4 flex shrink-0 items-center gap-1">
      <VerbButton label="Change" variant="ghost" onClick={() => onQuantity?.('change')} />
      <VerbButton label="Split" variant="ghost" onClick={() => onQuantity?.('split')} />
    </span>
  );
}

function StaticFact({
  fact,
  onQuantity,
  inlineLabel,
}: Pick<FactRowProps, 'fact' | 'onQuantity' | 'inlineLabel'>) {
  return (
    <div className="flex min-h-11 items-center gap-2 px-2 py-1">
      <span className={cn('flex min-w-0 flex-1', inlineLabel ? LINE : STACK)}>
        <FactLabel fact={fact} inline={inlineLabel} />
        <FactValue fact={fact} />
      </span>
      {fact.key === 'quantity' && onQuantity ? <QuantityActions onQuantity={onQuantity} /> : null}
    </div>
  );
}

function EditableFact({
  fact,
  onEdit,
  inlineLabel,
}: Pick<FactRowProps, 'fact' | 'onEdit' | 'inlineLabel'>) {
  return (
    <ButtonPrimitive
      variant="ghost"
      aria-label={`Edit ${fact.label}`}
      onClick={() => onEdit?.(fact.key)}
      className={cn(
        'h-auto min-h-11 w-full rounded-md px-2 py-1 text-left font-normal',
        inlineLabel ? LINE : STACK
      )}
    >
      <FactLabel fact={fact} inline={inlineLabel} />
      <FactValue fact={fact} />
    </ButtonPrimitive>
  );
}

function Body(props: FactRowProps) {
  const { fact, phase = 'idle' } = props;
  if (phase === 'editing' || phase === 'saving') {
    return (
      <Editor fact={fact} draft={props.draft ?? fact.value ?? ''} saving={phase === 'saving'} />
    );
  }
  if (props.readOnly === true || !fact.inline) {
    const onQuantity = props.readOnly === true ? undefined : props.onQuantity;
    return <StaticFact fact={fact} onQuantity={onQuantity} inlineLabel={props.inlineLabel} />;
  }
  return <EditableFact fact={fact} onEdit={props.onEdit} inlineLabel={props.inlineLabel} />;
}

/** One fact cell. */
export function FactRow(props: FactRowProps) {
  const phase = props.phase ?? 'idle';
  return (
    <div
      className={cn(
        'min-w-0 rounded-md border-l-2 border-transparent',
        props.fact.key === 'quantity' && '@xs:col-span-2',
        phase === 'pending' && 'border-l-app-accent',
        phase === 'rejected' && 'bg-warning/10',
        (phase === 'editing' || phase === 'saving') && 'bg-muted/60'
      )}
    >
      <Body {...props} />
      {phase === 'rejected' && props.rejection ? (
        <p role="alert" className="px-2 pb-1.5 text-xs text-foreground">
          <span className="font-medium">Not saved.</span> {props.rejection}
        </p>
      ) : null}
    </div>
  );
}
