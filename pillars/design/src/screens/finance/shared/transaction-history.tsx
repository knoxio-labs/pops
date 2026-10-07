import { formatBalance } from '@/fixtures/currencies';
import { actorLabel, GUEST_EMAIL } from '@/fixtures/sharing';
import {
  ACTION_VERB,
  deletedEntryHistory,
  entryHistory,
  type HistoryAction,
  historyAsGuestSees,
  type HistoryEvent,
  restoredEntryHistory,
} from '@/fixtures/transaction-history';
import { EDIT_FOOTER, EntryDialog } from '@/screens/finance/shared/transaction-attachments';
import { ArrowRight, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react';

import { Button, cn, Skeleton, Tabs, TabsList, TabsTrigger } from '@pops/ui';

import type { ScreenMeta, ScreenStates } from '@/contract';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Who changed a transaction, when, and what. It is a second tab of the edit
 * dialog rather than a section under the fields, so the dialog keeps its
 * height. An edit lists only the fields that changed, before and after.
 *
 * A deleted transaction opens on this tab alone: there is nothing to edit,
 * and the one thing left to do with it is bring it back.
 */
export const meta: ScreenMeta = { title: 'Transaction history', order: 27, frame: 'none' };

const ICON: Record<HistoryAction, LucideIcon> = {
  create: Plus,
  update: Pencil,
  delete: Trash2,
  restore: RotateCcw,
};

const when = (iso: string) =>
  new Date(iso).toLocaleString('en-AU', {
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });

function Changes({ event }: { event: HistoryEvent }) {
  if (event.changes.length === 0) return null;
  return (
    <dl className="mt-1 space-y-0.5 text-xs">
      {event.changes.map((change) => (
        <div key={change.field} className="flex flex-wrap items-center gap-x-1.5">
          <dt className="w-20 shrink-0 text-muted-foreground">{change.field}</dt>
          <dd className="text-muted-foreground line-through">{change.before}</dd>
          <ArrowRight className="size-3 text-muted-foreground" aria-label="changed to" />
          <dd className="font-medium">{change.after}</dd>
        </div>
      ))}
    </dl>
  );
}

function EventRow({ event, options }: { event: HistoryEvent; options: HistoryOptions }) {
  const Icon = ICON[event.action];
  const actor = actorLabel(event.byEmail, options.viewerEmail);
  const subject = options.named ? event.description : 'this';
  return (
    <li className="flex gap-3 border-b border-border py-2.5 last:border-b-0">
      <span
        className={cn(
          'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-muted',
          event.action === 'delete' ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-medium">{actor}</span> {ACTION_VERB[event.action]} {subject}
          {options.named && (
            <span className="text-muted-foreground tabular-nums">
              {' · '}
              {formatBalance(event.amount, 'AUD')}
            </span>
          )}
        </p>
        <p className="text-xs text-muted-foreground">{when(event.at)}</p>
        <Changes event={event} />
      </div>
      {event.restorable && options.canRestore && (
        <Button variant="outline" size="sm" prefix={<RotateCcw className="h-4 w-4" />}>
          Restore
        </Button>
      )}
    </li>
  );
}

export interface HistoryOptions {
  viewerEmail: string;
  /** False for the `view` role, which reads history and restores nothing. */
  canRestore: boolean;
  /** Name the entry on every row, as an account's activity must; one entry's own history need not. */
  named?: boolean;
}

/** Audit events, newest first. The list scrolls inside whatever holds it. */
export function HistoryList({
  events,
  options,
  footer,
}: {
  events: HistoryEvent[];
  options: HistoryOptions;
  footer?: ReactNode;
}) {
  return (
    <ul className="min-h-0 flex-1 overflow-y-auto" aria-label="History">
      {events.map((event) => (
        <EventRow key={event.id} event={event} options={options} />
      ))}
      {footer && <li className="py-2 text-center">{footer}</li>}
    </ul>
  );
}

const AS_GUEST: HistoryOptions = { viewerEmail: GUEST_EMAIL, canRestore: true };
const history = historyAsGuestSees(entryHistory);
const deletedHistory = historyAsGuestSees(deletedEntryHistory);
const restoredHistory = historyAsGuestSees(restoredEntryHistory);

function DetailsAndHistory({ children }: { children: ReactNode }) {
  return (
    <EntryDialog title="Edit transaction" footer={EDIT_FOOTER}>
      <Tabs value="history">
        <TabsList>
          <TabsTrigger value="details">Details</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
        </TabsList>
      </Tabs>
      <div className="flex h-72 flex-col">{children}</div>
    </EntryDialog>
  );
}

function Deleted({ canRestore, problem }: { canRestore: boolean; problem?: string }) {
  const footer = (
    <>
      <span className="text-xs text-destructive">{problem}</span>
      <span className="flex gap-2">
        <Button variant="outline">Close</Button>
        {canRestore && <Button prefix={<RotateCcw className="h-4 w-4" />}>Restore</Button>}
      </span>
    </>
  );
  return (
    <EntryDialog title="Deleted transaction" footer={footer}>
      <p className="text-sm text-muted-foreground">
        Dinner at Sample Trattoria, $86.00.{' '}
        {canRestore
          ? 'Restoring brings it back as it was, files included.'
          : 'Someone who can edit this account can restore it.'}
      </p>
      <div className="flex h-72 flex-col">
        <HistoryList
          events={deletedHistory.map((event) => ({ ...event, restorable: false }))}
          options={{ ...AS_GUEST, canRestore }}
        />
      </div>
    </EntryDialog>
  );
}

export const states: ScreenStates = {
  'just-created': () => (
    <DetailsAndHistory>
      <HistoryList events={history.slice(-1)} options={AS_GUEST} />
    </DetailsAndHistory>
  ),
  restored: () => (
    <DetailsAndHistory>
      <HistoryList events={restoredHistory} options={AS_GUEST} />
    </DetailsAndHistory>
  ),
  deleted: () => <Deleted canRestore />,
  'deleted-view-only': () => <Deleted canRestore={false} />,
  'restore-failed': () => (
    <Deleted canRestore problem="Could not restore it. Nothing changed; try again." />
  ),
  loading: () => (
    <DetailsAndHistory>
      <div className="space-y-3" role="status" aria-label="Loading">
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
        <Skeleton className="h-10" />
      </div>
    </DetailsAndHistory>
  ),
  error: () => (
    <DetailsAndHistory>
      <p className="m-auto text-center text-sm text-muted-foreground">
        Could not load the history. The transaction itself is unaffected.
        <Button variant="link" size="sm">
          Try again
        </Button>
      </p>
    </DetailsAndHistory>
  ),
};

export default function TransactionHistoryScreen() {
  return (
    <DetailsAndHistory>
      <HistoryList events={history} options={AS_GUEST} />
    </DetailsAndHistory>
  );
}
