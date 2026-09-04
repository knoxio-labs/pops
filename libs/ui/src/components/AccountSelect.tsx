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
import {
  accountSearchTerm,
  AccountOptionRow,
  AccountTriggerLabel,
  RevealArchivedRow,
} from './account-select/AccountSelectRows';
import { Button } from './Button';
import { ClearRow } from './entity-select/EntitySelectRows';

import type { AccountOption } from './account-shared/types';

export interface AccountSelectProps {
  accounts: AccountOption[];
  value?: string;
  /** Fires when an account is picked from the list — POPS-2821. */
  onChange?: (accountId: string, account: AccountOption) => void;
  /** When provided, a row that clears the current selection is rendered first. */
  onClear?: () => void;
  clearLabel?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
  className?: string;
  /**
   * Accessible name for the trigger. Required, not optional: the `combobox`
   * role takes no name from its own content, so the selected account's name
   * never labels the control on its own.
   */
  'aria-label': string;
}

function useAccountSelectState() {
  const [open, setOpenState] = useState(false);
  const [archivedRevealed, setArchivedRevealed] = useState(false);
  const setOpen = (next: boolean) => {
    setOpenState(next);
    if (!next) setArchivedRevealed(false);
  };
  return { open, setOpen, archivedRevealed, revealArchived: () => setArchivedRevealed(true) };
}

function AccountOptionsList({
  props,
  state,
}: {
  props: AccountSelectProps;
  state: ReturnType<typeof useAccountSelectState>;
}) {
  const { accounts, value, onChange, onClear, clearLabel = 'All accounts' } = props;
  const archived = accounts.filter((a) => a.archived);
  const visible = state.archivedRevealed ? accounts : accounts.filter((a) => !a.archived);
  return (
    <Command>
      <CommandInput placeholder={props.searchPlaceholder ?? 'Search accounts...'} />
      <CommandList>
        <CommandEmpty>{props.emptyMessage ?? 'No account matches.'}</CommandEmpty>
        {onClear && (
          <ClearRow
            label={clearLabel}
            onSelect={() => {
              onClear();
              state.setOpen(false);
            }}
          />
        )}
        <CommandGroup>
          {visible.map((account) => (
            <CommandItem
              key={account.id}
              value={accountSearchTerm(account)}
              onSelect={() => {
                onChange?.(account.id, account);
                state.setOpen(false);
              }}
            >
              <AccountOptionRow account={account} selectedId={value} />
            </CommandItem>
          ))}
        </CommandGroup>
        {!state.archivedRevealed && archived.length > 0 && (
          <RevealArchivedRow count={archived.length} onSelect={state.revealArchived} />
        )}
      </CommandList>
    </Command>
  );
}

/**
 * Searchable popover for choosing one account, per the `account-picker-shape`
 * decision (popover over inline chips). Supports an optional clear row
 * (`onClear`) and reveals archived accounts behind a row of their own rather
 * than mixing them in, matching `account-picker-shape`'s reviewed screen.
 */
export function AccountSelect(props: AccountSelectProps) {
  const { accounts, value, disabled = false, className, 'aria-label': ariaLabel } = props;
  const state = useAccountSelectState();
  const selected = accounts.find((a) => a.id === value);

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
          <AccountTriggerLabel
            selected={selected}
            placeholder={props.placeholder ?? 'Select account'}
          />
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <AccountOptionsList props={props} state={state} />
      </PopoverContent>
    </Popover>
  );
}
