import { formatBalance } from '@/fixtures/currencies';
import {
  actorLabel,
  asGuestSees,
  GUEST_EMAIL,
  guestAmount,
  type LedgerEntry,
  ledgerEntries,
  type SharedAccount,
  sharedAccounts,
} from '@/fixtures/sharing';
import { day } from '@/kit/account-dashboard';
import { ledgerTone } from '@/kit/ledger-tone';
import { GuestChrome } from '@/screens/shell/guest-shell';
import { Paperclip, Plus, ReceiptText, Search, SearchX, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import {
  Button,
  cn,
  EmptyState,
  PageHeader,
  Select,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TextInput,
} from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';

/**
 * The transactions list once it is a guest's. Gone: the entity and tag
 * columns, the purchase-link indicator and its detail panel, tag suggestions,
 * rule actions and bulk selection. Kept: date, description, account, amount,
 * and a count of attached files. Rows come only from accounts shared with the
 * guest, and Add transaction appears when at least one of them is `edit`.
 */
export const meta: ScreenMeta = { title: 'Transactions, guest', order: 23, frame: 'none' };

const ALL = 'all';

function Row({ entry, shared }: { entry: LedgerEntry; shared: SharedAccount }) {
  const account = asGuestSees(shared.account);
  const amount = guestAmount(entry, shared.account);
  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground tabular-nums">
        {day(entry.date)}
      </TableCell>
      <TableCell className="w-full max-w-0">
        <span className="block truncate text-sm">{entry.description}</span>
        <span className="block truncate text-xs text-muted-foreground">
          <span className="sm:hidden">{account.name} · </span>
          added by {actorLabel(entry.byEmail, GUEST_EMAIL).toLowerCase()}
        </span>
      </TableCell>
      <TableCell className="hidden text-sm sm:table-cell">{account.name}</TableCell>
      <TableCell className="hidden text-xs text-muted-foreground sm:table-cell">
        {entry.files > 0 && (
          <span className="flex items-center gap-1" aria-label={`${entry.files} files attached`}>
            <Paperclip className="size-3.5" aria-hidden />
            {entry.files}
          </span>
        )}
      </TableCell>
      <TableCell className={cn('text-right text-sm tabular-nums', ledgerTone(amount))}>
        {amount > 0 ? '+' : ''}
        {formatBalance(amount, account.currency)}
      </TableCell>
    </TableRow>
  );
}

function Rows({ entries, shared }: { entries: LedgerEntry[]; shared: SharedAccount[] }) {
  const byId = new Map(shared.map((item) => [item.account.id, item]));
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date</TableHead>
            <TableHead>Description</TableHead>
            <TableHead className="hidden sm:table-cell">Account</TableHead>
            <TableHead className="hidden sm:table-cell">Files</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {entries.map((entry) => {
            const item = byId.get(entry.accountId);
            return item ? <Row key={entry.id} entry={entry} shared={item} /> : null;
          })}
        </TableBody>
      </Table>
    </div>
  );
}

type Load = 'ready' | 'loading' | 'error';

interface PageProps {
  shared: SharedAccount[];
  entries?: LedgerEntry[];
  initialQuery?: string;
  load?: Load;
}

function Results({ entries, shared, load }: Required<Omit<PageProps, 'initialQuery'>>) {
  if (load === 'loading') {
    return (
      <div className="space-y-3" role="status" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    );
  }
  if (load === 'error') {
    return (
      <EmptyState
        className="m-auto"
        icon={TriangleAlert}
        title="Could not load transactions"
        description="Finance did not answer. Nothing was changed."
        action={<Button variant="outline">Try again</Button>}
      />
    );
  }
  if (entries.length === 0) {
    return (
      <EmptyState
        className="m-auto"
        icon={SearchX}
        title="No transactions match"
        description="Try a different word, or choose all accounts."
        action={<Button variant="outline">Clear filters</Button>}
      />
    );
  }
  return <Rows entries={entries} shared={shared} />;
}

function GuestTransactionsPage({
  shared,
  entries = ledgerEntries,
  initialQuery = '',
  load = 'ready',
}: PageProps) {
  const [accountId, setAccountId] = useState(ALL);
  const [query, setQuery] = useState(initialQuery);
  const visible = entries.filter(
    (entry) =>
      (accountId === ALL || entry.accountId === accountId) &&
      entry.description.toLowerCase().includes(query.trim().toLowerCase())
  );
  const canAdd = shared.some((item) => item.role === 'edit');
  const options = [
    { value: ALL, label: 'All shared accounts' },
    ...shared.map((item) => ({ value: item.account.id, label: asGuestSees(item.account).name })),
  ];
  return (
    <GuestChrome active="transactions">
      <PageHeader
        title="Transactions"
        description="Everything in the accounts shared with you."
        actions={canAdd && <Button prefix={<Plus className="h-4 w-4" />}>Add transaction</Button>}
      />
      {entries.length === 0 && load === 'ready' ? (
        <EmptyState
          className="m-auto"
          icon={ReceiptText}
          title="No transactions yet"
          description={canAdd ? 'Add the first one to get started.' : 'Nothing has been added yet.'}
        />
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            <span className="w-56 shrink-0">
              <Select
                aria-label="Account"
                options={options}
                value={accountId}
                onChange={(event) => setAccountId(event.target.value)}
              />
            </span>
            <TextInput
              aria-label="Search transactions"
              placeholder="Search descriptions"
              prefix={<Search className="size-4" aria-hidden />}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              containerClassName="min-w-48 flex-1"
            />
          </div>
          <Results entries={visible} shared={shared} load={load} />
        </>
      )}
    </GuestChrome>
  );
}

const viewOnly = sharedAccounts.map((item): SharedAccount => ({ ...item, role: 'view' }));

export const states: ScreenStates = {
  'view-only': () => <GuestTransactionsPage shared={viewOnly} />,
  'no-results': () => <GuestTransactionsPage shared={sharedAccounts} initialQuery="hotel" />,
  empty: () => <GuestTransactionsPage shared={sharedAccounts} entries={[]} />,
  loading: () => <GuestTransactionsPage shared={sharedAccounts} load="loading" />,
  error: () => <GuestTransactionsPage shared={sharedAccounts} load="error" />,
};

export default function GuestTransactionsScreen() {
  return <GuestTransactionsPage shared={sharedAccounts} />;
}
