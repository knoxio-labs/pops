import { Archive, ChevronDown, ChevronRight, ChevronUp, CircleDot, Plus } from 'lucide-react';
import { useState } from 'react';

import { Button, cn } from '@pops/ui';

import type { CatalogueField } from './types';

interface FieldOutlineProps {
  readonly fields: readonly CatalogueField[];
  readonly onAdd: () => void;
  readonly onMove: (fieldId: string, direction: -1 | 1) => void;
  readonly onSelect: (id: string) => void;
  readonly selectedId: string | null;
}

/** Ordered field outline with keyboard-operable reorder controls. */
export function FieldOutline({ fields, onAdd, onMove, onSelect, selectedId }: FieldOutlineProps) {
  const [showArchived, setShowArchived] = useState(false);
  const activeFields = fields.filter((field) => field.archivedAt === null);
  const visibleFields = showArchived ? fields : activeFields;
  const archivedCount = fields.length - activeFields.length;
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold">Fields</h3>
          <p className="text-xs text-muted-foreground">Set item form order</p>
        </div>
        <Button variant="outline" size="sm" onClick={onAdd}>
          <Plus className="h-4 w-4" />
          Field
        </Button>
      </div>
      <div className="space-y-1">
        {visibleFields.map((field, index) => (
          <FieldOutlineItem
            key={field.id}
            field={field}
            index={index}
            total={visibleFields.length}
            selected={selectedId === field.id}
            onMove={onMove}
            onSelect={onSelect}
          />
        ))}
        {visibleFields.length === 0 && (
          <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
            Add the first field.
          </p>
        )}
      </div>
      {archivedCount > 0 && (
        <Button
          type="button"
          variant="ghost"
          className="w-full justify-start text-muted-foreground"
          onClick={() => setShowArchived((shown) => !shown)}
        >
          <Archive className="h-4 w-4" />
          {showArchived ? 'Hide archived fields' : `Show archived fields (${archivedCount})`}
        </Button>
      )}
    </section>
  );
}

function FieldOutlineItem({
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
