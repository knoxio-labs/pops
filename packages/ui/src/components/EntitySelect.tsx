import { Check, ChevronsUpDown } from 'lucide-react';
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
import { Badge } from '../primitives/badge';
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
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Searchable combobox for selecting from a list of named entities.
 * Supports optional type badges and pending (locally-created) entity indicators.
 */
export function EntitySelect({
  entities,
  value,
  onChange,
  placeholder = 'Choose entity...',
  searchPlaceholder = 'Search entities...',
  emptyMessage = 'No entities found.',
  disabled = false,
  className,
}: EntitySelectProps) {
  const [open, setOpen] = useState(false);
  const selected = entities.find((e) => e.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          {selected ? (
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
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            <CommandGroup>
              {entities.map((entity) => (
                <CommandItem
                  key={entity.id}
                  value={`${entity.name} ${entity.type ?? ''}`}
                  onSelect={() => {
                    onChange?.(entity.id, entity.name);
                    setOpen(false);
                  }}
                >
                  <Check
                    className={`mr-2 h-4 w-4 ${value === entity.id ? 'opacity-100' : 'opacity-0'}`}
                  />
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
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
