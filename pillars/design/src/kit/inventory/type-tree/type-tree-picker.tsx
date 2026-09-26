import { Check, ChevronRight, CircleAlert } from 'lucide-react';

import { Badge, ComboboxSelect, cn } from '@pops/ui';

import { typeTreeOptions } from './model';

import type { TypeTreeOption, TypeTreeRecord } from './model';

/** Props for the shared hierarchical type chooser. */
export interface TypeTreePickerProps {
  types: readonly TypeTreeRecord[];
  value: string | null;
  onChange?: (typeId: string) => void;
  query?: string;
  open?: boolean;
  disabledIds?: ReadonlySet<string>;
  reasons?: ReadonlyMap<string, string>;
  label?: string;
  placeholder?: string;
}

function chooserOptions(types: readonly TypeTreeRecord[]): { value: string; label: string }[] {
  return typeTreeOptions(types, '', true).map((option) => ({
    value: option.value,
    label: option.pathLabel,
  }));
}

const DEPTH_PADDING: Readonly<Record<number, string>> = { 1: 'pl-0', 2: 'pl-3', 3: 'pl-6' };
const EMPTY_IDS: ReadonlySet<string> = new Set();
const EMPTY_REASONS: ReadonlyMap<string, string> = new Map();

function ChoiceRow({
  option,
  selected,
  onChange,
  reason,
}: {
  option: TypeTreeOption;
  selected: boolean;
  onChange?: (typeId: string) => void;
  reason?: string;
}) {
  const disabled = option.disabled === true || reason !== undefined;
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      disabled={disabled}
      onClick={() => onChange?.(option.value)}
      className={cn(
        'flex min-h-11 w-full items-start gap-3 px-3 py-2 text-left',
        disabled ? 'cursor-not-allowed opacity-55' : 'hover:bg-muted',
        selected && 'bg-primary/10'
      )}
    >
      <span className="flex size-5 shrink-0 items-center justify-center text-muted-foreground">
        {selected ? (
          <Check className="size-4 text-primary" aria-hidden />
        ) : (
          <ChevronRight className="size-4" aria-hidden />
        )}
      </span>
      <span className={cn('min-w-0 flex-1', DEPTH_PADDING[option.depth] ?? 'pl-6')}>
        <span className="block truncate text-sm font-medium">{option.label}</span>
        <span className="block truncate text-xs text-muted-foreground">{option.pathLabel}</span>
        {reason !== undefined ? (
          <span className="mt-0.5 flex items-start gap-1 text-xs text-warning">
            <CircleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
            {reason}
          </span>
        ) : null}
      </span>
      {option.disabled && reason === undefined ? <Badge variant="outline">Archived</Badge> : null}
    </button>
  );
}

function OpenChoices({
  label,
  query,
  visible,
  value,
  onChange,
  reasons,
}: {
  label: string;
  query: string;
  visible: readonly TypeTreeOption[];
  value: string | null;
  onChange?: (typeId: string) => void;
  reasons: ReadonlyMap<string, string>;
}) {
  return (
    <div
      role="listbox"
      aria-label={`${label} choices`}
      className="overflow-hidden rounded-lg border bg-card shadow-sm"
    >
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
        <span className="text-xs font-medium text-muted-foreground">
          {query === '' ? 'All types' : `Results for “${query}”`}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">{visible.length}</span>
      </div>
      <div className="max-h-72 overflow-y-auto py-1">
        {visible.map((option) => (
          <ChoiceRow
            key={option.value}
            option={option}
            selected={value === option.value}
            onChange={onChange}
            reason={reasons.get(option.value)}
          />
        ))}
      </div>
    </div>
  );
}

/** A ComboboxSelect-compatible type chooser with an optional open tree state. */
export function TypeTreePicker({
  types,
  value,
  onChange,
  query = '',
  open = false,
  disabledIds = EMPTY_IDS,
  reasons = EMPTY_REASONS,
  label = 'Type',
  placeholder = 'Choose a type',
}: TypeTreePickerProps) {
  const options = chooserOptions(types);
  const visible = typeTreeOptions(types, query, true);
  const disabled = new Set(disabledIds);
  for (const option of visible) if (option.disabled) disabled.add(option.value);
  return (
    <div className="space-y-2">
      <p className="text-sm font-medium">{label}</p>
      <ComboboxSelect
        id={`${label.toLocaleLowerCase().replaceAll(' ', '-')}-picker`}
        options={options.map((option) => ({
          ...option,
          disabled: disabled.has(option.value),
        }))}
        value={value ?? ''}
        placeholder={placeholder}
        searchPlaceholder="Search types by name or path"
        emptyMessage="No type matches this path."
        onChange={(next) => {
          const nextId = typeof next === 'string' ? next : next[0];
          if (nextId !== undefined) onChange?.(nextId);
        }}
      />
      {open ? (
        <OpenChoices
          label={label}
          query={query}
          visible={visible}
          value={value}
          onChange={onChange}
          reasons={reasons}
        />
      ) : null}
    </div>
  );
}
