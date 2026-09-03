import { type Currency } from '@/fixtures/currencies';
import { CurrencyCreateDialog } from '@/kit/currency-create-dialog';
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

function usePicker() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
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
function PickerPopover({
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

function CreateRow({ label, onSelect }: { label: string; onSelect: () => void }) {
  return (
    <CommandGroup forceMount>
      <CommandItem forceMount value={`create:${label}`} onSelect={onSelect}>
        <Plus className="mr-2 h-4 w-4" />
        Create &ldquo;{label}&rdquo;
      </CommandItem>
    </CommandGroup>
  );
}

function CurrencyRows({
  options,
  onChange,
}: {
  options: Currency[];
  onChange: (code: string) => void;
}) {
  return (
    <CommandGroup heading="Currencies">
      {options.map((c) => (
        <CommandItem key={c.code} value={`${c.code} ${c.name}`} onSelect={() => onChange(c.code)}>
          <span className="w-14 shrink-0 font-mono text-xs">{c.code}</span>
          {c.name}
          {c.kind === 'points' && (
            <span className="ml-auto text-xs text-muted-foreground">points</span>
          )}
        </CommandItem>
      ))}
    </CommandGroup>
  );
}

export interface CurrencySelectProps {
  options: Currency[];
  code: string;
  onChange: (code: string) => void;
  /** A currency minted from the create dialog. The caller is expected to select it. */
  onCreate: (currency: Currency) => void;
  error?: string;
  /** Lands directly on the create dialog, open and prefilled, for review. */
  initialCreateQuery?: string;
}

/** Searchable, growable currency picker: fiat and points share one table. */
export function CurrencySelect({
  options,
  code,
  onChange,
  onCreate,
  error,
  initialCreateQuery,
}: CurrencySelectProps) {
  const state = usePicker();
  const [creating, setCreating] = useState(Boolean(initialCreateQuery));
  const [createName, setCreateName] = useState(initialCreateQuery ?? '');
  const selected = options.find((c) => c.code === code);
  const query = state.query.trim();
  return (
    <div className="space-y-1.5">
      <Label htmlFor="currency">Currency</Label>
      <PickerPopover
        ariaLabel="Currency"
        trigger={selected ? `${selected.code} — ${selected.name}` : 'Choose currency...'}
        state={state}
        placeholder="Search currencies..."
        emptyMessage="No currencies found."
      >
        <CurrencyRows options={options} onChange={onChange} />
        {query && (
          <CreateRow
            label={query}
            onSelect={() => {
              setCreateName(query);
              setCreating(true);
              state.close();
            }}
          />
        )}
      </PickerPopover>
      {error && <p className="-mt-1 text-xs text-destructive">{error}</p>}
      {creating && (
        <CurrencyCreateDialog
          initialName={createName}
          onCancel={() => setCreating(false)}
          onCreated={(c) => {
            onCreate(c);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
