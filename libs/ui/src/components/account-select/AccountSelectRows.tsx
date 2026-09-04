/**
 * The rows and trigger label `AccountSelect` renders. Split out only to keep
 * that file within its line budget, matching `entity-select/EntitySelectRows.tsx`.
 */
import { Check } from 'lucide-react';

import { cn } from '../../lib/utils';
import { Badge } from '../../primitives/badge';
import { CommandGroup, CommandItem } from '../../primitives/command';
import { ACCOUNT_KIND_META } from '../account-shared/account-kinds';
import { AccountMark } from '../AccountChip';

import type { AccountOption } from '../account-shared/types';

/**
 * "Credit card · American Express", or just the kind label when an account
 * belongs to no institution — cash and person ledgers, mainly.
 */
export function accountSubtitle(account: AccountOption): string {
  const kind = ACCOUNT_KIND_META[account.kind].label;
  return account.institution ? `${kind} · ${account.institution.name}` : kind;
}

/**
 * What cmdk matches against. The subtitle is on screen, so someone who reads
 * "Credit card · ANZ" will type "ANZ" and expect every ANZ account to
 * surface — matching the name alone would show them none of it.
 */
export function accountSearchTerm(account: AccountOption): string {
  return `${account.name} ${accountSubtitle(account)}`;
}

export function AccountTriggerLabel({
  selected,
  placeholder,
}: {
  selected?: AccountOption;
  placeholder: string;
}) {
  if (!selected) return <span className="text-muted-foreground">{placeholder}</span>;
  return (
    <span className="flex min-w-0 items-center gap-2">
      <AccountMark account={selected} />
      <span className="truncate">{selected.name}</span>
    </span>
  );
}

export function AccountOptionRow({
  account,
  selectedId,
}: {
  account: AccountOption;
  selectedId?: string;
}) {
  return (
    <>
      <Check
        className={cn(
          'mt-0.5 mr-2 h-4 w-4 self-start',
          account.id === selectedId ? 'opacity-100' : 'opacity-0'
        )}
        aria-hidden
      />
      <AccountMark account={account} />
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
    </>
  );
}

/**
 * Always mounted so it survives cmdk's filter, exactly as `ClearRow` does for
 * `EntitySelect` — the label a search term is least likely to match is the
 * one naming "reveal the rest", not any specific account.
 */
export function RevealArchivedRow({ count, onSelect }: { count: number; onSelect: () => void }) {
  return (
    <CommandGroup forceMount>
      <CommandItem forceMount value={`reveal-archived-${count}`} onSelect={onSelect}>
        <span className="text-muted-foreground">Show {count} archived</span>
      </CommandItem>
    </CommandGroup>
  );
}
