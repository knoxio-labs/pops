/**
 * One row per plan entry inside a cell: a servings badge, a status chip when
 * cooked, and a drag handle that greys out when the entry is locked by a
 * cook. Clicking the row body opens `PlanEntryEditSheet`.
 */
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ChevronDown } from 'lucide-react';

import { Badge, Button, Collapsible, CollapsibleContent, CollapsibleTrigger } from '@pops/ui';

import type { ReactElement } from 'react';

import type { WirePlanEntryRow } from './plan-wire-types.js';

const TITLE_MAX = 18;

export interface PlanEntryRowProps {
  entry: WirePlanEntryRow;
  onEdit: (entryId: number) => void;
}

export function PlanEntryRow({ entry, onEdit }: PlanEntryRowProps): ReactElement {
  const locked = entry.recipeRunId !== null;
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entry.id,
    disabled: locked,
  });
  const title = truncate(entry.recipeTitle, TITLE_MAX);
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-1 rounded border bg-card px-1.5 py-1 text-xs cursor-pointer"
      data-testid={`plan-entry-${entry.id}`}
      onClick={(e) => {
        if ((e.target as HTMLElement).dataset.draghandle === 'true') return;
        onEdit(entry.id);
      }}
    >
      <span
        data-draghandle="true"
        className={`inline-flex min-h-11 min-w-11 items-center justify-center cursor-grab text-muted-foreground ${
          locked ? 'opacity-30 cursor-not-allowed' : ''
        }`}
        title={locked ? 'Cooked entries cannot be moved' : 'Drag to reorder'}
        {...attributes}
        {...listeners}
      >
        ⋮⋮
      </span>
      <EntryTitle entry={entry} title={title} />
      {entry.plannedServings > 1 && (
        <Badge variant="outline" data-testid={`servings-badge-${entry.id}`}>
          ×{entry.plannedServings}
        </Badge>
      )}
      {locked && <CookedEntryBadge entryId={entry.id} />}
    </div>
  );
}

function EntryTitle({ entry, title }: { entry: WirePlanEntryRow; title: string }): ReactElement {
  if (title === entry.recipeTitle) {
    return (
      <span className="min-w-0 flex-1 truncate" title={entry.recipeTitle}>
        {title}
      </span>
    );
  }
  return (
    <Collapsible className="min-w-0 flex-1" onClick={(event) => event.stopPropagation()}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 min-w-0 w-full justify-between gap-1 px-1"
          aria-label={entry.recipeTitle}
          title={entry.recipeTitle}
        >
          <span className="min-w-0 flex-1 truncate">{title}</span>
          <ChevronDown className="h-3 w-3 shrink-0" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="break-words py-1 text-xs">{entry.recipeTitle}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function CookedEntryBadge({ entryId }: { entryId: number }): ReactElement {
  const moveReason = 'Cooked entries cannot be moved';
  return (
    <Collapsible className="shrink-0" onClick={(event) => event.stopPropagation()}>
      <CollapsibleTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="min-h-11 gap-1 px-1"
          title={moveReason}
          aria-label={`cooked: ${moveReason}`}
        >
          <Badge variant="secondary" data-testid={`cooked-chip-${entryId}`}>
            cooked
          </Badge>
          <ChevronDown className="h-3 w-3 text-muted-foreground" aria-hidden="true" />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <p className="max-w-48 text-xs text-muted-foreground">{moveReason}</p>
      </CollapsibleContent>
    </Collapsible>
  );
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
