/**
 * The code: optional, unique, printed on the label. Suggest sits beside the
 * field; an offered code shows in the field itself and Enter takes it. A
 * taken code names who has it and offers the next free one (ADR-002 D7).
 */
import { Check, LoaderCircle, QrCode } from 'lucide-react';

import { Button, ButtonPrimitive, Input, cn } from '@pops/ui';

import { FieldHint, FieldProblem, PROBLEM_RING } from '../field-editors/field-note';
import { HintTooltip } from '../shared/hint-tooltip';
import { ShortcutHint } from '../shared/kbd';
import { FormField } from './identity-fields';

import type { CodeEntry } from './code-assist';

/** Props for {@link CodeField}. */
export interface CodeFieldProps {
  entry: CodeEntry;
  typeLabel: string | null;
  onType: (value: string) => void;
  onSuggest: () => void;
  onAccept: () => void;
}

function SuggestControl({ entry, onSuggest }: Pick<CodeFieldProps, 'entry' | 'onSuggest'>) {
  if (entry.assist.kind === 'suggesting') {
    return (
      <LoaderCircle
        className="mx-2.5 size-4 animate-spin text-muted-foreground"
        aria-label="Looking for a free code"
      />
    );
  }
  const cannot = entry.assist.kind === 'offline' || entry.assist.kind === 'unavailable';
  return (
    <HintTooltip
      label="Suggest a code"
      disabledReason={cannot ? 'No code can be suggested right now' : undefined}
    >
      <ButtonPrimitive
        variant="ghost"
        size="icon-sm"
        aria-label="Suggest a code"
        aria-disabled={cannot || undefined}
        onClick={cannot ? undefined : onSuggest}
        className={cn('text-muted-foreground', cannot && 'opacity-50')}
      >
        <QrCode className="size-4" aria-hidden />
      </ButtonPrimitive>
    </HintTooltip>
  );
}

function CodeMessage({ entry, typeLabel, onType, onAccept }: CodeFieldProps) {
  const { assist, check } = entry;
  if (assist.kind === 'offered') {
    return (
      <FieldHint className="flex items-center gap-1.5">
        <ShortcutHint id="form-accept-code" /> uses {assist.suggestion}, the next free{' '}
        {typeLabel ?? 'house'} code.
        <Button variant="link" size="sm" onClick={onAccept} className="h-auto min-h-0 p-0 text-xs">
          Use it
        </Button>
      </FieldHint>
    );
  }
  if (assist.kind === 'offline')
    return <FieldHint>Offline, so no code can be suggested.</FieldHint>;
  if (assist.kind === 'unavailable') {
    return <FieldHint>No code can be suggested right now. Type one or leave it empty.</FieldHint>;
  }
  if (check.kind === 'taken') {
    return (
      <FieldProblem id="item-code-problem">
        That code is already on {check.holder.name}. {check.freeCode} is free.{' '}
        <Button
          variant="link"
          size="sm"
          onClick={() => onType(check.freeCode)}
          className="h-auto min-h-0 p-0 text-xs"
        >
          Use {check.freeCode}
        </Button>
      </FieldProblem>
    );
  }
  if (check.kind === 'checking') return <FieldHint>Checking {entry.value.trim()}…</FieldHint>;
  if (check.kind === 'free') {
    return (
      <FieldHint className="flex items-center gap-1">
        <Check className="size-3.5 text-app-accent" aria-hidden />
        {entry.value.trim()} is free.
      </FieldHint>
    );
  }
  return null;
}

/** The code field with its assist and uniqueness check. */
export function CodeField(props: CodeFieldProps) {
  const { entry, onType, onAccept } = props;
  const offered = entry.assist.kind === 'offered' ? entry.assist.suggestion : null;
  const taken = entry.check.kind === 'taken';
  return (
    <FormField id="item-code" label="Code" aside="Optional, unique">
      <div className="flex items-center gap-1">
        <Input
          id="item-code"
          value={entry.value}
          placeholder={offered ?? 'Printed on the label'}
          aria-invalid={taken || undefined}
          aria-describedby={taken ? 'item-code-problem' : undefined}
          onChange={(event) => onType(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || offered === null || entry.value !== '') return;
            event.preventDefault();
            onAccept();
          }}
          className={cn(
            'h-9 font-mono',
            offered !== null && 'placeholder:text-foreground/45',
            taken && PROBLEM_RING
          )}
        />
        <SuggestControl entry={entry} onSuggest={props.onSuggest} />
      </div>
      <CodeMessage {...props} />
    </FormField>
  );
}
