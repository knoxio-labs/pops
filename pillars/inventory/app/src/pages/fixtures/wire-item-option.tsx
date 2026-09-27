import { Check } from 'lucide-react';

import { Checkbox } from '@pops/ui';

import type { ReactElement } from 'react';

import type { ItemRowModel } from '../../foundation/model/model.js';

/** Props for one selectable or refused item in the wire picker. */
export interface WireItemOptionProps {
  readonly item: ItemRowModel;
  readonly selected: boolean;
  readonly refusal: string | null;
  readonly onToggle: () => void;
}

/** Renders one item option with an explicit refusal reason when it cannot be wired. */
export function WireItemOption({
  item,
  selected,
  refusal,
  onToggle,
}: WireItemOptionProps): ReactElement {
  const disabled = refusal !== null;
  return (
    <div
      role="option"
      aria-selected={selected}
      aria-disabled={disabled || undefined}
      tabIndex={disabled ? -1 : 0}
      className="flex min-h-12 items-center gap-3 rounded-lg px-2 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={disabled ? undefined : onToggle}
      onKeyDown={(event) => {
        if (!disabled && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          onToggle();
        }
      }}
    >
      <Checkbox
        checked={selected}
        disabled={disabled}
        aria-label={`${selected ? 'Deselect' : 'Select'} ${item.name}`}
        onClick={(event) => event.preventDefault()}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{item.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {refusal ?? item.typeName ?? 'Uncategorised'}
        </span>
      </span>
      {selected ? <Check className="size-4 text-app-accent" aria-hidden /> : null}
    </div>
  );
}
