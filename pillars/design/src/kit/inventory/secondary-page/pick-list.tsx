/**
 * A searchable list to choose one or several things from, for the connect
 * dialog and the wire-items sheet. A choice that cannot be made stays in the
 * list, dimmed, with its reason on the row instead of vanishing.
 */
import { Check } from 'lucide-react';

import { ButtonPrimitive, cn } from '@pops/ui';

import { FilterField } from './list-parts';

import type { ReactNode } from 'react';

/** One choice. */
export interface PickOption {
  key: string;
  mark: ReactNode;
  title: string;
  meta?: ReactNode;
  /** Why this cannot be chosen; the row stays, dimmed. */
  refusal?: string;
}

/** Props for {@link PickList}. */
export interface PickListProps {
  label: string;
  options: readonly PickOption[];
  selected: ReadonlySet<string>;
  multiple?: boolean;
  query: string;
  placeholder: string;
  onQueryChange?: (query: string) => void;
  onToggle?: (key: string) => void;
  empty?: string;
  className?: string;
}

function TickBox({ checked }: { checked: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-4 shrink-0 items-center justify-center rounded-sm border',
        checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-background'
      )}
    >
      {checked ? <Check className="size-3" /> : null}
    </span>
  );
}

function OptionRow({
  option,
  selected,
  multiple,
  onToggle,
}: {
  option: PickOption;
  selected: boolean;
  multiple: boolean;
  onToggle?: (key: string) => void;
}) {
  const refused = option.refusal !== undefined;
  return (
    <ButtonPrimitive
      variant="ghost"
      role="option"
      aria-selected={selected}
      aria-disabled={refused || undefined}
      onClick={refused ? undefined : () => onToggle?.(option.key)}
      className={cn(
        'h-auto min-h-11 w-full justify-start gap-3 rounded-none px-3 py-1.5 text-left font-normal',
        selected && 'bg-app-accent/10 hover:bg-app-accent/15',
        refused && 'cursor-not-allowed opacity-60 hover:bg-transparent'
      )}
    >
      {multiple ? <TickBox checked={selected} /> : null}
      {option.mark}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium">{option.title}</span>
        {refused ? (
          <span className="truncate text-xs text-muted-foreground">{option.refusal}</span>
        ) : (
          <span className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
            {option.meta}
          </span>
        )}
      </span>
      {!multiple && selected ? <Check className="size-4 text-app-accent" aria-hidden /> : null}
    </ButtonPrimitive>
  );
}

/** The pick list. */
export function PickList(props: PickListProps) {
  const { options, selected, multiple = false } = props;
  return (
    <div className={cn('flex min-h-0 flex-col gap-2', props.className)}>
      <FilterField
        value={props.query}
        placeholder={props.placeholder}
        onChange={props.onQueryChange}
        className="w-full"
      />
      <div
        role="listbox"
        aria-label={props.label}
        aria-multiselectable={multiple || undefined}
        className="relative min-h-0 flex-1 divide-y divide-border/60 overflow-y-auto rounded-lg border bg-card"
      >
        {options.length === 0 ? (
          <p className="px-3 py-6 text-center text-sm text-muted-foreground">
            {props.empty ?? 'Nothing matches.'}
          </p>
        ) : (
          options.map((option) => (
            <OptionRow
              key={option.key}
              option={option}
              selected={selected.has(option.key)}
              multiple={multiple}
              onToggle={props.onToggle}
            />
          ))
        )}
      </div>
    </div>
  );
}
