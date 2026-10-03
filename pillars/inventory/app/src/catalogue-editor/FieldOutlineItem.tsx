import { ChevronDown, ChevronRight, ChevronUp, CircleDot } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import type { CatalogueField } from './types';

/** Renders one editable field row and its keyboard-operable reorder controls. */
export function FieldOutlineItem({
  field,
  index,
  onMove,
  onSelect,
  selected,
  total,
}: {
  readonly field: CatalogueField;
  readonly index: number;
  readonly onMove: (id: string, direction: -1 | 1) => void;
  readonly onSelect: (id: string) => void;
  readonly selected: boolean;
  readonly total: number;
}) {
  const isArchived = field.archivedAt !== null;
  return (
    <div
      className={cn(
        'flex min-h-11 items-center rounded-md border px-1 py-1',
        selected ? 'border-primary bg-primary/10' : 'border-transparent'
      )}
    >
      <FieldMoveButtons
        field={field}
        index={index}
        total={total}
        disabled={isArchived}
        onMove={onMove}
      />
      <button
        type="button"
        onClick={() => onSelect(field.id)}
        className="flex min-h-11 min-w-11 flex-1 items-center gap-2 px-1 py-1 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className={cn('block truncate text-sm font-medium', isArchived && 'line-through')}>
            {field.label}
          </span>
          <span className="block text-xs text-muted-foreground">
            {field.storage === 'computed' ? 'Computed · ' : ''}
            {field.kind} · {field.cardinality}
          </span>
        </span>
        {field.required && <CircleDot className="h-3.5 w-3.5 text-primary" aria-label="Required" />}
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </button>
    </div>
  );
}

function FieldMoveButtons({
  disabled,
  field,
  index,
  onMove,
  total,
}: {
  readonly disabled: boolean;
  readonly field: CatalogueField;
  readonly index: number;
  readonly onMove: (id: string, direction: -1 | 1) => void;
  readonly total: number;
}) {
  return (
    <div className="flex flex-col">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Move ${field.label} up`}
        disabled={disabled || index === 0}
        onClick={() => onMove(field.id, -1)}
      >
        <ChevronUp className="h-3 w-3" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="min-h-11 min-w-11"
        aria-label={`Move ${field.label} down`}
        disabled={disabled || index === total - 1}
        onClick={() => onMove(field.id, 1)}
      >
        <ChevronDown className="h-3 w-3" />
      </Button>
    </div>
  );
}
