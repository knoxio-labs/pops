import { ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { type Account } from '@/fixtures/accounts';
import { formatBalance } from '@/fixtures/currencies';
import { institutionsById } from '@/fixtures/institutions';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { Check, ChevronsUpDown } from 'lucide-react';
import { useState } from 'react';

import {
  Badge,
  Button,
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  cn,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@pops/ui';

/**
 * "Credit card · American Express", or just the kind label when an account
 * belongs to no institution — cash and person ledgers, mainly.
 */
export function accountSubtitle(account: Account): string {
  const kind = ACCOUNT_KINDS[account.kind].label;
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)
    : undefined;
  return institution ? `${kind} · ${institution.name}` : kind;
}

/**
 * What cmdk matches against. The subtitle is on screen, so someone who reads
 * "Credit card · ANZ" will type "ANZ" and expect all three ANZ accounts —
 * matching the name alone would show them one.
 */
function searchTerm(account: Account): string {
  return `${account.name} ${accountSubtitle(account)} ${account.currency}`;
}

function AccountOption({ account, selected }: { account: Account; selected: boolean }) {
  return (
    <>
      <Check
        className={cn('mt-0.5 mr-2 h-4 w-4 self-start', selected ? 'opacity-100' : 'opacity-0')}
        aria-hidden
      />
      <AccountAvatar account={account} />
      <span className="ml-2 min-w-0 flex-1">
        <span className="block truncate">{account.name}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {accountSubtitle(account)}
        </span>
      </span>
      {account.archived && (
        <Badge variant="outline" className="ml-2 shrink-0 self-start text-xs">
          Archived
        </Badge>
      )}
      <span className="ml-2 shrink-0 self-start text-xs text-muted-foreground tabular-nums">
        {formatBalance(account.balance, account.currency)}
      </span>
    </>
  );
}

function AccountOptions({
  accounts,
  clearable,
  archivedRevealed,
  onRevealArchived,
  value,
  onSelect,
}: {
  accounts: Account[];
  clearable?: boolean;
  archivedRevealed: boolean;
  onRevealArchived: () => void;
  value?: string;
  onSelect: (id?: string) => void;
}) {
  const archived = accounts.filter((a) => a.archived);
  const visible = archivedRevealed ? accounts : accounts.filter((a) => !a.archived);
  return (
    <CommandList>
      <CommandEmpty>No account matches.</CommandEmpty>
      {clearable && (
        <CommandGroup forceMount>
          <CommandItem forceMount value="All accounts" onSelect={() => onSelect(undefined)}>
            <span className="text-muted-foreground">All accounts</span>
          </CommandItem>
        </CommandGroup>
      )}
      <CommandGroup>
        {visible.map((account) => (
          <CommandItem
            key={account.id}
            value={searchTerm(account)}
            onSelect={() => onSelect(account.id)}
          >
            <AccountOption account={account} selected={account.id === value} />
          </CommandItem>
        ))}
      </CommandGroup>
      {!archivedRevealed && archived.length > 0 && (
        <CommandGroup forceMount>
          <CommandItem
            forceMount
            value={`reveal-archived-${archived.length}`}
            onSelect={onRevealArchived}
          >
            <span className="text-muted-foreground">Show {archived.length} archived</span>
          </CommandItem>
        </CommandGroup>
      )}
    </CommandList>
  );
}

export interface AccountSelectProps {
  accounts: Account[];
  initialId?: string;
  clearable?: boolean;
  placeholder?: string;
  ariaLabel: string;
  defaultOpen?: boolean;
  defaultArchivedRevealed?: boolean;
}

/**
 * A searchable popover for choosing one account — the `EntitySelect` shape,
 * carrying its own open/search/selection state so each mounted instance is
 * independent of any other on the same page.
 */
export function AccountSelect({
  accounts,
  initialId,
  clearable,
  placeholder = 'Select account',
  ariaLabel,
  defaultOpen = false,
  defaultArchivedRevealed = false,
}: AccountSelectProps) {
  const [open, setOpen] = useState(defaultOpen);
  const [archivedRevealed, setArchivedRevealed] = useState(defaultArchivedRevealed);
  const [value, setValue] = useState(initialId);
  const selected = accounts.find((a) => a.id === value);

  const openChange = (next: boolean) => {
    setOpen(next);
    if (!next) setArchivedRevealed(defaultArchivedRevealed);
  };
  const select = (id?: string) => {
    setValue(id);
    openChange(false);
  };

  return (
    <Popover open={open} onOpenChange={openChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={ariaLabel}
          className="w-full justify-between font-normal"
        >
          {selected ? (
            <span className="flex min-w-0 items-center gap-2">
              <AccountAvatar account={selected} />
              <span className="truncate">{selected.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0">
        <Command>
          <CommandInput placeholder="Search accounts…" />
          <AccountOptions
            accounts={accounts}
            clearable={clearable}
            archivedRevealed={archivedRevealed}
            onRevealArchived={() => setArchivedRevealed(true)}
            value={value}
            onSelect={select}
          />
        </Command>
      </PopoverContent>
    </Popover>
  );
}
