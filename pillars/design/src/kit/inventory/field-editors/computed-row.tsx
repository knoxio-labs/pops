/**
 * A computed field in the item form, in the words and marks of the approved
 * computed-field editor's preview: the result and its workings when
 * calculated, the typed value and what it hides when overridden, and
 * "Unavailable" naming every missing input (`unavailableSentence`) when it
 * cannot be calculated. An override fills in when the result is unavailable.
 */
import { CircleSlash, Pencil, Undo2 } from 'lucide-react';

import { unavailableSentence } from '@pops/inventory/expression';
import { Button, Input } from '@pops/ui';

import type { PreviewMissingInput } from '@pops/inventory/expression';

import type { FormFieldDef } from './field-model';

/** What the server's evaluation says about one computed field on this item. */
export type ComputedDisplay =
  | { state: 'pending' }
  | { state: 'calculated'; value: string; workings: string }
  | { state: 'unavailable'; missingInputs: readonly PreviewMissingInput[] };

/** Props for {@link ComputedValue}. */
export interface ComputedValueProps {
  field: FormFieldDef;
  display: ComputedDisplay;
  /** The typed value replacing the result, when there is one. */
  override: string | undefined;
  onOverride: (value: string | null) => void;
}

function OverrideButton({ field, display, onOverride }: ComputedValueProps) {
  if (field.computed?.allowOverride !== true) return null;
  const seed = display.state === 'calculated' ? display.value : '';
  return (
    <Button
      variant="ghost"
      size="sm"
      prefix={<Pencil className="size-3.5" aria-hidden />}
      onClick={() => onOverride(seed)}
      className="shrink-0 text-muted-foreground"
    >
      Override
    </Button>
  );
}

function Overridden({ field, display, override, onOverride }: ComputedValueProps) {
  const hidden =
    display.state === 'calculated'
      ? `Calculates ${display.value} once the override is cleared.`
      : 'Unavailable once the override is cleared.';
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Input
          id={`field-${field.id}`}
          value={override ?? ''}
          inputMode="decimal"
          aria-label={`${field.label}, overridden`}
          onChange={(event) => onOverride(event.target.value)}
          className="h-9 max-w-40 tabular-nums"
        />
        <Button
          variant="ghost"
          size="sm"
          prefix={<Undo2 className="size-3.5" aria-hidden />}
          onClick={() => onOverride(null)}
          className="text-muted-foreground"
        >
          Clear override
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        <span className="font-medium text-foreground">Overridden.</span> {hidden}
      </p>
    </div>
  );
}

function Result(props: ComputedValueProps) {
  const { display } = props;
  if (display.state === 'pending') {
    return (
      <p className="flex min-h-9 items-center text-sm text-muted-foreground">
        Calculated once saved, from {props.field.computed?.reads.join(' and ')}.
      </p>
    );
  }
  return (
    <div className="flex items-start gap-2">
      <div className="min-w-0 flex-1 space-y-0.5 pt-1.5">
        {display.state === 'calculated' ? (
          <>
            <p className="text-sm font-semibold tabular-nums">{display.value}</p>
            <p className="text-xs text-muted-foreground">{display.workings}</p>
          </>
        ) : (
          <>
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <CircleSlash className="size-4 text-muted-foreground" aria-hidden />
              Unavailable
            </p>
            <p className="text-xs text-foreground">{unavailableSentence(display.missingInputs)}</p>
          </>
        )}
      </div>
      <OverrideButton {...props} />
    </div>
  );
}

/** The value side of a computed row. */
export function ComputedValue(props: ComputedValueProps) {
  return props.override === undefined ? <Result {...props} /> : <Overridden {...props} />;
}
