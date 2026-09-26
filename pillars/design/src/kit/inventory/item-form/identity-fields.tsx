import { Check } from 'lucide-react';

/**
 * The item's own fields that every item has, type or not: name (the one
 * required value), type and note. Labels sit above their controls so the
 * left column reads top to bottom in Tab order.
 */
import { ComboboxSelect, Input, Label, Textarea, cn } from '@pops/ui';

import { FieldHint, FieldProblem, PROBLEM_RING } from '../field-editors/field-note';
import { typeTreeOptions } from '../type-tree/model';

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

function typePickerOptions(types: readonly FormTypeDef[]) {
  return typeTreeOptions(types, '', true).map((option) => ({
    value: option.value,
    label: `${'  '.repeat(option.depth - 1)}${option.pathLabel}`,
    disabled: option.disabled,
  }));
}

const DEPTH_PADDING: Readonly<Record<number, string>> = { 1: 'pl-0', 2: 'pl-3', 3: 'pl-6' };

function OpenTypeTree({
  types,
  typeId,
  query,
  onChange,
}: {
  types: readonly FormTypeDef[];
  typeId: string | null;
  query: string;
  onChange: (type: FormTypeDef | null) => void;
}) {
  return (
    <div
      role="listbox"
      aria-label="Type tree choices"
      className="overflow-hidden rounded-lg border bg-card shadow-sm"
    >
      <div className="border-b bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
        {query === '' ? 'Choose a type' : `Results for “${query}”`}
      </div>
      <div className="max-h-60 overflow-y-auto py-1">
        {typeTreeOptions(types, query, true).map((option) => (
          <button
            key={option.value}
            type="button"
            role="option"
            aria-selected={option.value === typeId}
            disabled={option.disabled}
            onClick={() => onChange(types.find((type) => type.id === option.value) ?? null)}
            className={cn(
              'flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm',
              option.disabled ? 'opacity-50' : 'hover:bg-muted',
              option.value === typeId && 'bg-primary/10'
            )}
          >
            <span className="flex w-4 shrink-0 items-center text-muted-foreground">
              {option.value === typeId ? <Check className="size-3.5" aria-hidden /> : null}
            </span>
            <span className={cn('min-w-0 flex-1 truncate', DEPTH_PADDING[option.depth] ?? 'pl-6')}>
              {option.pathLabel}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

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
  treeOpen = false,
  treeQuery = '',
}: {
  types: readonly FormTypeDef[];
  typeId: string | null;
  offerNone: boolean;
  onChange: (type: FormTypeDef | null) => void;
  treeOpen?: boolean;
  treeQuery?: string;
}) {
  const options = [
    ...(offerNone ? [{ value: NO_TYPE, label: 'No type yet' }] : []),
    ...typePickerOptions(types),
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
      {treeOpen ? (
        <OpenTypeTree types={types} typeId={typeId} query={treeQuery} onChange={onChange} />
      ) : null}
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
