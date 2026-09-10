import { accounts } from '@/fixtures/accounts';
import { TODAY } from '@/fixtures/import-sources';
import {
  type PendingImport,
  type PendingImportState,
  sourceLabel,
} from '@/fixtures/pending-imports';
import { when } from '@/kit/import-status-section';
import { AccountAvatar } from '@/screens/finance/account-chip';
import { FileText, History, Lock, Radio, TriangleAlert } from 'lucide-react';

import { Badge, Button, Card, cn } from '@pops/ui';

const accountsById = new Map(accounts.map((a) => [a.id, a]));

function accountById(id: string) {
  const found = accountsById.get(id);
  if (!found) throw new Error(`no fixture account ${id}`);
  return found;
}

/**
 * One pending import, as every entry point shows it: the dashboard, the
 * wizard's first step and the pending list all compose this card, so the
 * three never describe the same draft in different words. The state decides
 * the one action on offer (a draft resumes, a live import opens, an open
 * one is taken over, an unusable one can only be discarded), and the card
 * says what the wizard will do before it is clicked, because a draft is
 * three weeks of someone's decisions and "Resume" alone does not say so.
 */
const STATE_BADGE: Record<
  PendingImportState,
  { label: string; tone: 'secondary' | 'destructive' | 'default' }
> = {
  saved: { label: 'Saved', tone: 'secondary' },
  live: { label: 'Live', tone: 'default' },
  open: { label: 'Open in another tab', tone: 'secondary' },
  unusable: { label: 'Needs discarding', tone: 'destructive' },
};

const STALE_OPEN_MS = 24 * 60 * 60 * 1000;

/**
 * An open import whose tab has not checked in for a day is almost always a
 * tab that closed without saying so (a crash, a killed browser). It is
 * still "open" on the server, but the card should stop pretending someone
 * is in it.
 */
export function openAge(item: PendingImport, now = `${TODAY}T12:00:00+10:00`): 'active' | 'stale' {
  const seen = item.lastSeenAt ?? item.savedAt;
  return Date.parse(now) - Date.parse(seen) > STALE_OPEN_MS ? 'stale' : 'active';
}

function daysAgo(iso: string, now: string): string {
  const days = Math.round((Date.parse(now) - Date.parse(iso)) / STALE_OPEN_MS);
  return days === 1 ? '1 day ago' : `${days} days ago`;
}

function stateIcon(item: PendingImport) {
  if (item.state === 'unusable') return <TriangleAlert className="h-4 w-4 text-destructive" />;
  if (item.state === 'open') return <Lock className="h-4 w-4 text-muted-foreground" />;
  if (item.source.kind === 'live') return <Radio className="h-4 w-4 text-primary" />;
  return <FileText className="h-4 w-4 text-muted-foreground" />;
}

function rows(n: number): string {
  return n === 1 ? '1 transaction' : `${n} transactions`;
}

function openLine(item: PendingImport, now: string): string {
  const seen = item.lastSeenAt ?? item.savedAt;
  const at = item.step ?? 'the start';
  return openAge(item, now) === 'stale'
    ? `Last seen ${daysAgo(seen, now)}, at ${at}. The tab probably closed without saying so; taking over loses nothing.`
    : `Open in another tab since ${when(seen)}, at ${at}.`;
}

function liveLine(item: PendingImport): string {
  const since = item.arrivedSinceSave;
  if (since !== undefined) {
    return `${rows(since)} arrived after the open import was started. They are held here so it stays as you left it.`;
  }
  const need = item.unresolvedCount ?? 0;
  const tail = need === 0 ? 'waiting for review' : `${need} need you`;
  return `${rows(item.rowCount)} arrived since ${when(item.savedAt)} · ${tail}.`;
}

function savedLine(item: PendingImport): string {
  const unresolved = item.unresolvedCount ?? 0;
  const decisions = unresolved === 0 ? 'nothing left to decide' : `${unresolved} still to decide`;
  return `${rows(item.rowCount)}, stopped at ${item.step ?? 'the start'} · ${decisions}.`;
}

/** The one line under the title: how far it got, or why it cannot go further. */
export function progressLine(item: PendingImport, now = `${TODAY}T12:00:00+10:00`): string {
  switch (item.state) {
    case 'unusable':
      return item.unusableReason ?? 'Cannot be resumed.';
    case 'open':
      return openLine(item, now);
    case 'live':
      return liveLine(item);
    case 'saved':
      return savedLine(item);
  }
}

function action(item: PendingImport) {
  switch (item.state) {
    case 'saved':
      return (
        <Button size="sm" prefix={<History className="h-4 w-4" />}>
          Resume
        </Button>
      );
    case 'live':
      return <Button size="sm">Review</Button>;
    case 'open':
      return (
        <Button size="sm" variant={openAge(item) === 'stale' ? 'default' : 'outline'}>
          {openAge(item) === 'stale' ? 'Take over' : 'Take over here'}
        </Button>
      );
    case 'unusable':
      return (
        <Button size="sm" variant="destructive">
          Discard
        </Button>
      );
  }
}

export function PendingImportCard({
  item,
  compact = false,
}: {
  item: PendingImport;
  compact?: boolean;
}) {
  const account = accountById(item.accountId);
  const badge =
    item.state === 'open' && openAge(item) === 'stale'
      ? { label: 'Left open', tone: 'secondary' as const }
      : STATE_BADGE[item.state];
  return (
    <Card
      className={cn(compact ? 'p-3' : 'p-4', item.state === 'unusable' && 'border-destructive/40')}
    >
      <div className="flex items-center gap-3">
        <AccountAvatar account={account} size={compact ? 'sm' : 'md'} />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            {stateIcon(item)}
            <span className="truncate text-sm font-medium">
              {account.name} · {sourceLabel(item.source)}
            </span>
            <Badge variant={badge.tone} className="font-normal">
              {badge.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">{progressLine(item)}</p>
          {!compact && item.span && item.state !== 'unusable' && (
            <p className="text-xs text-muted-foreground">
              Covers {item.span.from} – {item.span.to} · saved {when(item.savedAt)}
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {item.state === 'saved' && (
            <Button size="sm" variant="ghost">
              Discard
            </Button>
          )}
          {action(item)}
        </div>
      </div>
    </Card>
  );
}

/** The cards in the order a person should deal with them: unusable first, then open, live, saved. */
const ORDER: Record<PendingImportState, number> = { unusable: 0, open: 1, live: 2, saved: 3 };

export function sortPending(items: PendingImport[]): PendingImport[] {
  return items.toSorted(
    (a, b) => ORDER[a.state] - ORDER[b.state] || b.savedAt.localeCompare(a.savedAt)
  );
}

export function PendingImportList({
  items,
  compact = false,
}: {
  items: PendingImport[];
  compact?: boolean;
}) {
  return (
    <div className="space-y-3">
      {sortPending(items).map((item) => (
        <PendingImportCard key={item.id} item={item} compact={compact} />
      ))}
    </div>
  );
}
