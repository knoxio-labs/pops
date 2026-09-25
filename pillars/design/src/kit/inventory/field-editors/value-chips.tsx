/**
 * The editor for a field that holds several values: the values as chips in
 * their stored order (duplicates allowed, because order and repetition can
 * mean something), and one input at the end that adds on Enter. A value that
 * breaks the kind's rule stays as a flagged chip so it can be fixed, not lost.
 */
import { Plus, X } from 'lucide-react';
import { useState } from 'react';

import { ButtonPrimitive, Input, cn } from '@pops/ui';

import { PROBLEM_RING } from './field-note';
import { atomError } from './field-rules';

import type { CatalogueFieldKind } from '@/fixtures/inventory-type-fields';

import type { FormFieldDef } from './field-model';

const ADD_TYPES: Partial<Record<CatalogueFieldKind, string>> = {
  date: 'date',
  date_time: 'datetime-local',
  url: 'url',
};

function chipText(field: FormFieldDef, value: string): string {
  if (field.kind === 'date_time') return value.replace('T', ' ');
  return field.unit === undefined ? value : `${value} ${field.unit}`;
}

function Chip({
  field,
  value,
  onRemove,
}: {
  field: FormFieldDef;
  value: string;
  onRemove: () => void;
}) {
  const broken = atomError(field, value) !== null;
  return (
    <li
      className={cn(
        'flex h-8 max-w-full items-center rounded-md border bg-muted/50 pl-2 text-sm',
        broken && 'border-warning bg-warning/10'
      )}
    >
      <span className={cn('truncate', field.kind !== 'url' && 'tabular-nums')}>
        {chipText(field, value)}
      </span>
      <ButtonPrimitive
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${chipText(field, value)} from ${field.label}`}
        onClick={onRemove}
        className="text-muted-foreground"
      >
        <X className="size-3.5" aria-hidden />
      </ButtonPrimitive>
    </li>
  );
}

function occurrenceKey(values: readonly string[], index: number): string {
  const value = values[index] ?? '';
  const earlier = values.slice(0, index).filter((candidate) => candidate === value).length;
  return `${value}#${String(earlier)}`;
}

/** Props for {@link ValueChips}. */
export interface ValueChipsProps {
  field: FormFieldDef;
  values: readonly string[];
  onChange: (values: readonly string[]) => void;
  invalid?: boolean;
  describedBy?: string;
}

/** Several values of one text-like kind. */
export function ValueChips({ field, values, onChange, invalid, describedBy }: ValueChipsProps) {
  const [pending, setPending] = useState('');
  const add = () => {
    if (pending.trim() === '') return;
    onChange([...values, pending.trim()]);
    setPending('');
  };
  return (
    <div
      className={cn(
        'flex min-h-10 flex-wrap items-center gap-1 rounded-md border bg-background p-0.5',
        invalid && PROBLEM_RING
      )}
    >
      <ul className="contents" aria-label={`${field.label} values`}>
        {values.map((value, index) => (
          <Chip
            key={occurrenceKey(values, index)}
            field={field}
            value={value}
            onRemove={() => onChange(values.filter((_, at) => at !== index))}
          />
        ))}
      </ul>
      <span className="relative flex min-w-32 flex-1 items-center">
        <Input
          id={`field-${field.id}`}
          type={ADD_TYPES[field.kind] ?? 'text'}
          value={pending}
          aria-label={`Add to ${field.label}`}
          aria-describedby={describedBy}
          placeholder={values.length === 0 ? 'Add a value' : 'Add another'}
          onChange={(event) => setPending(event.target.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter') return;
            event.preventDefault();
            add();
          }}
          className="h-8 border-0 px-1.5 shadow-none focus-visible:ring-0"
        />
        {field.unit === undefined ? null : (
          <span className="pointer-events-none pr-1 text-sm text-muted-foreground">
            {field.unit}
          </span>
        )}
        <ButtonPrimitive
          variant="ghost"
          size="icon-xs"
          aria-label={`Add to ${field.label}`}
          onClick={add}
          className="text-muted-foreground"
        >
          <Plus className="size-3.5" aria-hidden />
        </ButtonPrimitive>
      </span>
    </div>
  );
}
