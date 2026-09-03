import { initials, type Institution } from '@/fixtures/institutions';
import { ChevronsUpDown, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pops/ui';

export function usePicker(initialQuery = '') {
  const [open, setOpen] = useState(initialQuery.length > 0);
  const [query, setQuery] = useState(initialQuery);
  const close = () => {
    setOpen(false);
    setQuery('');
  };
  return {
    open,
    query,
    setQuery,
    close,
    onOpenChange: (next: boolean) => (next ? setOpen(true) : close()),
  };
}

type PickerState = ReturnType<typeof usePicker>;

/** The Popover/Command shell a search-and-create picker renders. */
export function PickerPopover({
  ariaLabel,
  trigger,
  state,
  placeholder,
  emptyMessage,
  children,
}: {
  ariaLabel: string;
  trigger: ReactNode;
  state: PickerState;
  placeholder: string;
  emptyMessage: string;
  children: ReactNode;
}) {
  const { open, query, setQuery, onOpenChange } = state;
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between font-normal"
        >
          {trigger}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder={placeholder} value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>{emptyMessage}</CommandEmpty>
            {children}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

/**
 * An institution's mark: its logo when one has been uploaded, its initials on
 * its brand colour when not.
 */
export function InstitutionMark({ institution }: { institution: Institution }) {
  if (institution.logo) {
    return <img src={institution.logo} alt="" className="h-5 w-5 shrink-0 rounded" />;
  }
  return (
    <span
      className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-[9px] font-semibold text-white"
      style={{ backgroundColor: institution.colour }}
      aria-hidden
    >
      {initials(institution.name)}
    </span>
  );
}

export function CreateRow({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <CommandGroup forceMount>
      <CommandItem forceMount value={`create:${label}`} onSelect={onSelect}>
        <Plus className="mr-2 h-4 w-4" />
        Create &ldquo;{label}&rdquo;
      </CommandItem>
    </CommandGroup>
  );
}

export interface InstitutionSelectProps {
  options: Institution[];
  selected?: Institution;
  onChange: (id: string) => void;
  /** A search term that matches no institution offers this row; the caller mints the id. */
  onCreate: (name: string) => void;
  initialQuery?: string;
}

/** Searchable institution picker, modelled on `EntitySelect`, with a create row. */
export function InstitutionSelect({
  options,
  selected,
  onChange,
  onCreate,
  initialQuery,
}: InstitutionSelectProps) {
  const state = usePicker(initialQuery);
  const query = state.query.trim();
  const trigger = selected ? (
    <span className="flex items-center gap-2 truncate">
      <InstitutionMark institution={selected} />
      {selected.name}
    </span>
  ) : (
    <span className="text-muted-foreground">No institution</span>
  );
  return (
    <div className="space-y-1.5">
      <Label htmlFor="institution">Institution</Label>
      <PickerPopover
        ariaLabel="Institution"
        trigger={trigger}
        state={state}
        placeholder="Search institutions..."
        emptyMessage="No institutions found."
      >
        <CommandGroup>
          {options.map((inst) => (
            <CommandItem
              key={inst.id}
              value={inst.name}
              onSelect={() => {
                onChange(inst.id);
                state.close();
              }}
            >
              <InstitutionMark institution={inst} />
              <span className="ml-2 truncate">{inst.name}</span>
            </CommandItem>
          ))}
        </CommandGroup>
        {query && (
          <CreateRow
            label={query}
            onSelect={() => {
              onCreate(query);
              state.close();
            }}
          />
        )}
      </PickerPopover>
    </div>
  );
}
