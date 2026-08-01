import { Check, ChevronsUpDown, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../lib/utils';
import { Badge } from '../primitives/badge';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '../primitives/command';
import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { Button } from './Button';

export interface EntityOption {
  id: string;
  name: string;
  /** Optional tag shown as a badge (e.g. entity type) */
  type?: string;
  /** When true, renders the name in italic and shows a "Pending" badge */
  pending?: boolean;
}

export interface EntitySelectProps {
  entities: EntityOption[];
  value?: string;
  onChange?: (entityId: string, entityName: string) => void;
  /**
   * When provided, a search term that matches no entity name offers a create
   * row and the trimmed term is passed back. The caller owns creation and is
   * expected to select the resulting entity.
   */
  onCreate?: (name: string) => void;
  /** When provided, a row that clears the current selection is rendered first. */
  onClear?: () => void;
  clearLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Accessible name for the trigger. Required for a labelled control: the
   * `combobox` role takes no name from its own content, so the selected entity
   * name is not one.
   */
  'aria-label'?: string;
}

function EntityTriggerLabel({
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

function EntityRow({ entity, selectedId }: { entity: EntityOption; selectedId?: string }) {
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
function ClearRow({ label, onSelect }: { label: string; onSelect: () => void }) {
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
function CreateRow({ name, onSelect }: { name: string; onSelect: () => void }) {
  return (
    <CommandGroup forceMount>
      <CommandItem forceMount value={`create:${name}`} onSelect={onSelect}>
        <Plus className="mr-2 h-4 w-4" />
        <span className="truncate">Create &ldquo;{name}&rdquo;</span>
      </CommandItem>
    </CommandGroup>
  );
}

function useEntitySelectState(entities: EntityOption[], onCreate?: (name: string) => void) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const nameTaken = entities.some((e) => e.name.toLowerCase() === trimmedQuery.toLowerCase());
  return {
    open,
    query,
    setQuery,
    trimmedQuery,
    canCreate: Boolean(onCreate) && trimmedQuery.length > 0 && !nameTaken,
    setOpen: (next: boolean) => {
      setOpen(next);
      if (!next) setQuery('');
    },
    close: () => {
      setOpen(false);
      setQuery('');
    },
  };
}

function EntityPickerList({
  props,
  state,
}: {
  props: EntitySelectProps;
  state: ReturnType<typeof useEntitySelectState>;
}) {
  const { entities, value, onChange, onCreate, onClear, clearLabel = 'No entity' } = props;
  return (
    <Command>
      <CommandInput
        placeholder={props.searchPlaceholder ?? 'Search entities...'}
        value={state.query}
        onValueChange={state.setQuery}
      />
      <CommandList>
        <CommandEmpty>{props.emptyMessage ?? 'No entities found.'}</CommandEmpty>
        {onClear && (
          <ClearRow
            label={clearLabel}
            onSelect={() => {
              onClear();
              state.close();
            }}
          />
        )}
        <CommandGroup>
          {entities.map((entity) => (
            <CommandItem
              key={entity.id}
              value={`${entity.name} ${entity.type ?? ''}`}
              onSelect={() => {
                onChange?.(entity.id, entity.name);
                state.close();
              }}
            >
              <EntityRow entity={entity} selectedId={value} />
            </CommandItem>
          ))}
        </CommandGroup>
        {state.canCreate && (
          <CreateRow
            name={state.trimmedQuery}
            onSelect={() => {
              onCreate?.(state.trimmedQuery);
              state.close();
            }}
          />
        )}
      </CommandList>
    </Command>
  );
}

/**
 * Searchable combobox for selecting from a list of named entities.
 * Supports optional type badges, pending (locally-created) entity indicators,
 * a clear row (`onClear`), and creating an entity from the search term
 * (`onCreate`).
 */
export function EntitySelect(props: EntitySelectProps) {
  const { entities, value, disabled = false, className, 'aria-label': ariaLabel } = props;
  const state = useEntitySelectState(entities, props.onCreate);
  const selected = entities.find((e) => e.id === value);

  return (
    <Popover open={state.open} onOpenChange={state.setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={state.open}
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <EntityTriggerLabel
            selected={selected}
            placeholder={props.placeholder ?? 'Choose entity...'}
          />
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <EntityPickerList props={props} state={state} />
      </PopoverContent>
    </Popover>
  );
}
