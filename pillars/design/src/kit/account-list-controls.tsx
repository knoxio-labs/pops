import { type AccountKind, ACCOUNT_KINDS } from '@/fixtures/account-kinds';
import { institutionsById } from '@/fixtures/institutions';
import { Archive, Landmark, Plus, Search, SearchX } from 'lucide-react';
import { useState } from 'react';

import { Button, cn, EmptyState, TextInput } from '@pops/ui';

import type { Account } from '@/fixtures/accounts';

/**
 * The selected treatment for a filter toggle, written out rather than left to
 * the Button's `default` variant: nine chips filled solid with the accent read
 * as nine primary actions, and relying on the variant put the selected state
 * at the mercy of whatever else the cascade applies to a small outline button.
 */
const SELECTED_CHIP = 'border-primary bg-primary/15 text-primary hover:bg-primary/20';

/**
 * The search, kind filter and archived reveal that sit above the accounts
 * list. It lives outside `src/screens` so every shape under the accounts
 * experiment offers the same controls over the same data — the shape is what
 * is being compared, not the filtering.
 */
export interface AccountListFilters {
  query: string;
  setQuery: (query: string) => void;
  kinds: AccountKind[];
  toggleKind: (kind: AccountKind) => void;
  showArchived: boolean;
  toggleArchived: () => void;
  clear: () => void;
  /** The kinds present in the data, in vocabulary order. */
  presentKinds: AccountKind[];
  /** The accounts to render, filtered and in display order. */
  visible: Account[];
  archivedCount: number;
  /** Whether a search or kind filter is narrowing the list. */
  narrowed: boolean;
  /** The PageHeader line, which counts what is on screen once a filter is on. */
  description: string;
}

function searchText(account: Account): string {
  const institution = account.institutionId
    ? institutionsById.get(account.institutionId)?.name
    : undefined;
  return `${account.name} ${institution ?? ''} ${account.contact ?? ''}`.toLowerCase();
}

function matches(account: Account, query: string, kinds: AccountKind[]): boolean {
  if (kinds.length > 0 && !kinds.includes(account.kind)) return false;
  const needle = query.trim().toLowerCase();
  return needle === '' || searchText(account).includes(needle);
}

function describe(total: number, shown: number, archived: number, narrowed: boolean): string {
  if (total === 0) return 'Every transaction belongs to an account.';
  if (narrowed) return `${shown} of ${total} accounts`;
  return `${total - archived} active · ${archived} archived`;
}

/** Owns the query, the selected kinds and the archived reveal, and applies all three. */
export function useAccountListFilters(accounts: Account[], initialQuery = ''): AccountListFilters {
  const [query, setQuery] = useState(initialQuery);
  const [kinds, setKinds] = useState<AccountKind[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const narrowed = query.trim() !== '' || kinds.length > 0;
  const visible = accounts
    .filter((a) => (showArchived || !a.archived) && matches(a, query, kinds))
    .toSorted((a, b) => a.order - b.order);
  return {
    query,
    setQuery,
    kinds,
    toggleKind: (kind) =>
      setKinds((prev) => (prev.includes(kind) ? prev.filter((k) => k !== kind) : [...prev, kind])),
    showArchived,
    toggleArchived: () => setShowArchived((prev) => !prev),
    clear: () => {
      setQuery('');
      setKinds([]);
    },
    presentKinds: (Object.keys(ACCOUNT_KINDS) as AccountKind[]).filter((kind) =>
      accounts.some((a) => a.kind === kind)
    ),
    visible,
    archivedCount: accounts.filter((a) => a.archived).length,
    narrowed,
    description: describe(
      accounts.length,
      visible.length,
      accounts.filter((a) => a.archived).length,
      narrowed
    ),
  };
}

function KindChip({
  kind,
  on,
  onToggle,
}: {
  kind: AccountKind;
  on: boolean;
  onToggle: () => void;
}) {
  const meta = ACCOUNT_KINDS[kind];
  const Icon = meta.icon;
  return (
    <Button
      variant="outline"
      size="sm"
      prefix={<Icon className="h-4 w-4" />}
      aria-pressed={on}
      onClick={onToggle}
      className={cn(on && SELECTED_CHIP)}
    >
      {meta.label}
    </Button>
  );
}

/** The control row: search, one toggle per kind present, and the archived reveal. */
export function AccountListControls({ filters }: { filters: AccountListFilters }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <TextInput
        value={filters.query}
        onChange={(event) => filters.setQuery(event.target.value)}
        onClear={() => filters.setQuery('')}
        prefix={<Search className="h-4 w-4" />}
        placeholder="Search accounts"
        aria-label="Search accounts"
        clearable
        containerClassName="w-56"
      />
      {filters.presentKinds.map((kind) => (
        <KindChip
          key={kind}
          kind={kind}
          on={filters.kinds.includes(kind)}
          onToggle={() => filters.toggleKind(kind)}
        />
      ))}
      {filters.archivedCount > 0 && (
        <Button
          variant="outline"
          size="sm"
          prefix={<Archive className="h-4 w-4" />}
          aria-pressed={filters.showArchived}
          onClick={filters.toggleArchived}
          className={cn('ml-auto', filters.showArchived && SELECTED_CHIP)}
        >
          {filters.showArchived
            ? `Hide ${filters.archivedCount} archived`
            : `Show ${filters.archivedCount} archived`}
        </Button>
      )}
    </div>
  );
}

/** There are no accounts at all — the first thing a fresh install has to fix. */
export function NoAccountsYet() {
  return (
    <EmptyState
      icon={Landmark}
      title="No accounts yet"
      description="Add the accounts you bank with. Every imported transaction is filed against one, so this comes before the first import."
      action={<Button prefix={<Plus className="h-4 w-4" />}>Add your first account</Button>}
    />
  );
}

/** There are accounts, but the search and kind filter matched none of them. */
export function NoMatchingAccounts({ onClear }: { onClear: () => void }) {
  return (
    <EmptyState
      icon={SearchX}
      title="No accounts match"
      description="Nothing here matches the search and kinds you have selected. Archived accounts stay hidden until you reveal them."
      action={
        <Button variant="outline" onClick={onClear}>
          Clear filters
        </Button>
      }
    />
  );
}
