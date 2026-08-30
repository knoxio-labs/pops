/**
 * The rows and trigger label `EntitySelect` renders. Split out only to keep
 * that file within its line budget.
 */
import { Check, Plus, X } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Badge } from '../../primitives/badge';
import { CommandGroup, CommandItem } from '../../primitives/command';

import type { EntityOption } from './types';

export function EntityTriggerLabel({
  selected,
  placeholder,
}: {
  selected?: EntityOption;
  placeholder: string;
}) {
  if (!selected) return <span className="text-muted-foreground">{placeholder}</span>;
  return (
    <span className="flex items-center gap-2 truncate">
      <span className={cn('truncate', selected.pending && 'italic')}>{selected.name}</span>
      {selected.pending && (
        <Badge variant="secondary" className="text-xs shrink-0">
          Pending
        </Badge>
      )}
      {selected.type && (
        <Badge variant="outline" className="text-xs capitalize shrink-0">
          {selected.type}
        </Badge>
      )}
    </span>
  );
}

export function EntityRow({ entity, selectedId }: { entity: EntityOption; selectedId?: string }) {
  return (
    <>
      <Check className={`mr-2 h-4 w-4 ${selectedId === entity.id ? 'opacity-100' : 'opacity-0'}`} />
      <span className={cn('truncate', entity.pending && 'italic')}>{entity.name}</span>
      {entity.pending && (
        <Badge variant="secondary" className="ml-1 text-xs shrink-0">
          Pending
        </Badge>
      )}
      {entity.type && (
        <Badge variant="outline" className="ml-auto text-xs capitalize shrink-0">
          {entity.type}
        </Badge>
      )}
    </>
  );
}

/**
 * Always mounted: cmdk filters on the row's own label, so a search term that
 * doesn't match it would hide the only way to select no entity — exactly when
 * the user is searching for what to replace.
 */
export function ClearRow({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <CommandGroup forceMount>
      <CommandItem forceMount value={label} onSelect={onSelect}>
        <X className="mr-2 h-4 w-4" />
        <span className="text-muted-foreground">{label}</span>
      </CommandItem>
    </CommandGroup>
  );
}

/**
 * Always mounted so it survives cmdk's filter — the term that produced it by
 * definition matches no existing entity, so a filtered row would never show.
 */
export function CreateRow({ name, onSelect }: { name: string; onSelect: () => void }) {
  return (
    <CommandGroup forceMount>
      <CommandItem forceMount value={`create:${name}`} onSelect={onSelect}>
        <Plus className="mr-2 h-4 w-4" />
        <span className="truncate">Create &ldquo;{name}&rdquo;</span>
      </CommandItem>
    </CommandGroup>
  );
}
