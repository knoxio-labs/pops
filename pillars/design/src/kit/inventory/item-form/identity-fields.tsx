/**
 * The item's own fields that every item has, type or not: name (the one
 * required value), type and note. Labels sit above their controls so the
 * left column reads top to bottom in Tab order.
 */
import { ComboboxSelect, Input, Label, Textarea, cn } from '@pops/ui';

import { FieldHint, FieldProblem, PROBLEM_RING } from '../field-editors/field-note';

import type { ReactNode } from 'react';

import type { FormTypeDef } from '../field-editors/field-model';

/** A labelled control in the left column. */
export function FormField({
  id,
  label,
  aside,
  children,
}: {
  id: string;
  label: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {aside === undefined ? null : (
          <span className="text-xs text-muted-foreground">{aside}</span>
        )}
      </div>
      {children}
    </div>
  );
}

/** The name: required, and focused first on create. */
export function NameField({
  value,
  error,
  onChange,
  autoFocus,
}: {
  value: string;
  error: string | null;
  onChange: (value: string) => void;
  autoFocus: boolean;
}) {
  return (
    <FormField id="item-name" label="Name" aside="Required">
      <Input
        id="item-name"
        value={value}
        autoFocus={autoFocus}
        placeholder="What it is, as you would say it"
        aria-required
        aria-invalid={error !== null || undefined}
        aria-describedby={error === null ? undefined : 'item-name-problem'}
        onChange={(event) => onChange(event.target.value)}
        className={cn('h-9', error !== null && PROBLEM_RING)}
      />
      {error === null ? null : <FieldProblem id="item-name-problem">{error}</FieldProblem>}
    </FormField>
  );
}

const NO_TYPE = 'none';

/**
 * The type. "No type yet" is a real answer while creating (the item can be
 * typed later); once an item has a type it is not offered, because nothing
 * takes a type away.
 */
export function TypeField({
  types,
  typeId,
  offerNone,
  onChange,
}: {
  types: readonly FormTypeDef[];
  typeId: string | null;
  offerNone: boolean;
  onChange: (type: FormTypeDef | null) => void;
}) {
  const options = [
    ...(offerNone ? [{ value: NO_TYPE, label: 'No type yet' }] : []),
    ...types.map((type) => ({ value: type.id, label: type.label })),
  ];
  const chosen = types.find((type) => type.id === typeId);
  return (
    <FormField id="item-type" label="Type">
      <ComboboxSelect
        id="item-type"
        options={options}
        value={typeId ?? NO_TYPE}
        searchPlaceholder="Search types"
        emptyMessage="No published type matches."
        size="sm"
        className="h-9 w-full"
        onChange={(value) => {
          const next = typeof value === 'string' ? value : (value[0] ?? NO_TYPE);
          onChange(types.find((type) => type.id === next) ?? null);
        }}
      />
      {chosen?.containment === true ? (
        <FieldHint>A container: it holds other items and is always one.</FieldHint>
      ) : null}
    </FormField>
  );
}

/** Free prose for whatever the type does not ask for, pinned under the field list. */
export function NoteField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-[10.5rem_minmax(0,1fr)] items-start gap-x-4 border-t px-5 py-3">
      <Label htmlFor="item-note" className="flex min-h-9 items-center text-sm font-medium">
        Note
      </Label>
      <Textarea
        id="item-note"
        value={value}
        rows={1}
        placeholder="Anything the fields do not cover"
        onChange={(event) => onChange(event.target.value)}
        className="min-h-9 resize-none text-sm"
      />
    </div>
  );
}
