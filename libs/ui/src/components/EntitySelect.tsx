import { ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import { cn } from '../lib/utils';
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
import {
  ClearRow,
  CreateRow,
  EntityRow,
  EntityTriggerLabel,
} from './entity-select/EntitySelectRows';

export interface EntityOption {
  id: string;
  name: string;
  /** Optional tag shown as a badge (e.g. entity type) */
  type?: string;
  /**
   * Other names this entity is known by. Searchable but not rendered: someone
   * who types a merchant's alias is looking for that merchant, and offering to
   * create it instead mints a duplicate.
   */
  aliases?: readonly string[];
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

function useEntitySelectState(entities: EntityOption[], onCreate?: (name: string) => void) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const trimmedQuery = query.trim();
  const target = trimmedQuery.toLowerCase();
  const nameTaken = entities.some(
    (e) =>
      e.name.toLowerCase() === target ||
      (e.aliases ?? []).some((alias) => alias.toLowerCase() === target)
  );
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
              value={`${entity.name} ${(entity.aliases ?? []).join(' ')} ${entity.type ?? ''}`}
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
