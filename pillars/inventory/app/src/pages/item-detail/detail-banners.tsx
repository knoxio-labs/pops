import { useState } from 'react';

import { StateBanner, OFFLINE_TITLE } from '../../foundation/feedback/state-banner.js';
import { dateTime } from '../../foundation/item-page/section-parts.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { useWebEvents } from '../../inventory-web/useWebEvents.js';

import type { ReactElement } from 'react';

import type { Lifecycle, ItemRowModel } from '../../foundation/model/model.js';
import type { WebSyncLedgerGetResponse } from '../../inventory-api/types.gen.js';

/** One sync-ledger attention entry relevant to the item-detail route. */
export type DetailSyncCase = WebSyncLedgerGetResponse['attention'][number];

/** The actor and server timestamp used to explain a stale item snapshot. */
export interface DetailStaleState {
  actorLabel: string;
  latestServerTime: string;
}

interface DetailBannersProps {
  item: ItemRowModel;
  cases: readonly DetailSyncCase[];
  stale: DetailStaleState | null;
  offline: boolean;
  onReload: () => void;
  onOpenCase: (caseId: string) => void;
}

const LIFECYCLE_MEANING: Readonly<Record<Exclude<Lifecycle, 'active'>, string>> = {
  retired: 'Kept on record but out of lists unless you include inactive items.',
  discarded: 'Out of lists unless you include inactive items. Restore brings it back.',
  lost: 'Out of lists until it turns up. Found it puts it back in use.',
  destroyed: 'This is final. It cannot be restored or changed, and its history stays.',
};

const LIFECYCLE_LABEL: Readonly<Record<Exclude<Lifecycle, 'active'>, string>> = {
  retired: 'Retired',
  discarded: 'Discarded',
  lost: 'Marked lost',
  destroyed: 'Destroyed',
};

function itemCaseFor(itemId: string, cases: readonly DetailSyncCase[]): DetailSyncCase | null {
  return cases.find((entry) => entry.itemId === itemId) ?? null;
}

function isConflict(entry: DetailSyncCase | null): entry is DetailSyncCase & {
  mine: NonNullable<DetailSyncCase['mine']>;
  theirs: NonNullable<DetailSyncCase['theirs']>;
} {
  return entry?.mine !== undefined && entry.theirs !== undefined;
}

function ageInMinutes(iso: string, now: number): number {
  const elapsed = now - Date.parse(iso);
  return Number.isFinite(elapsed) ? Math.max(1, Math.floor(elapsed / 60_000)) : 1;
}

interface StateBannerOptions {
  entry: DetailSyncCase | null;
  stale: DetailStaleState | null;
  staleMinutes: number;
  offline: boolean;
  onReload: () => void;
  onOpenCase: (caseId: string) => void;
}

function stateBanner({
  entry,
  stale,
  staleMinutes,
  offline,
  onReload,
  onOpenCase,
}: StateBannerOptions): ReactElement | null {
  if (isConflict(entry)) {
    return (
      <StateBanner
        kind="conflict"
        title={`${entry.problem} was changed on ${entry.theirs.source} while you were editing it.`}
        detail={`Yours: ${entry.mine.value}. Theirs: ${entry.theirs.value}. Nothing is lost until you choose.`}
        actionLabel="Resolve in Sync"
        onAction={() => onOpenCase(entry.id)}
      />
    );
  }
  if (offline) {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Changes are off until the connection returns."
      />
    );
  }
  if (stale !== null) {
    return (
      <StateBanner
        kind="stale"
        title={`Changed on ${stale.actorLabel} ${staleMinutes} ${staleMinutes === 1 ? 'minute' : 'minutes'} ago.`}
        detail="This page shows it as it was before. Reload to see the change."
        actionLabel="Reload"
        onAction={onReload}
      />
    );
  }
  if (entry !== null) {
    return (
      <StateBanner
        kind="needs-attention"
        title={entry.problem}
        actionLabel="Open in Sync"
        onAction={() => onOpenCase(entry.id)}
      />
    );
  }
  return null;
}

function lifecycleEventMatches(item: ItemRowModel, lifecycle: string | undefined): boolean {
  return item.lifecycle !== 'active' && lifecycle === item.lifecycle;
}

function LifecycleNoticeFor({ item }: { item: ItemRowModel }): ReactElement | null {
  const feed = useWebEvents({ entityId: item.id, kinds: ['lifecycle_changed'], limit: 1 });
  const event = feed.events[0];
  const lifecycle = typeof event?.after.lifecycle === 'string' ? event.after.lifecycle : undefined;
  if (feed.status !== 'success' || event === undefined || !lifecycleEventMatches(item, lifecycle)) {
    return null;
  }
  const current = item.lifecycle;
  if (current === 'active') return null;
  const Icon = INVENTORY_ICONS[current];
  const reason = event.reason === null ? '' : `: ${event.reason}`;
  return (
    <div
      role="status"
      className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
        current === 'destroyed' ? 'bg-muted' : 'bg-card'
      }`}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-foreground">
          {LIFECYCLE_LABEL[current]} {dateTime(event.serverTime)} by {event.actor.label}
          {reason}
        </p>
        <p className="text-xs text-muted-foreground">{LIFECYCLE_MEANING[current]}</p>
      </div>
    </div>
  );
}

function PreviousDeletedNotice({ item }: { item: ItemRowModel }): ReactElement | null {
  if (item.placement.kind !== 'in-hand' || item.previous?.kind !== 'deleted') return null;
  return (
    <StateBanner
      kind="needs-attention"
      title={`Picked up from ${item.previous.name}, which has since been deleted.`}
      detail="Put back has nowhere to go. Move it to choose a new place."
    />
  );
}

/** Renders item-detail sync, stale-data, lifecycle, and deleted-place notices. */
export function DetailBanners({
  item,
  cases,
  stale,
  offline,
  onReload,
  onOpenCase,
}: DetailBannersProps): ReactElement | null {
  const [now] = useState(() => Date.now());
  const staleMinutes = stale === null ? 1 : ageInMinutes(stale.latestServerTime, now);
  const entry = itemCaseFor(item.id, cases);
  const banner = stateBanner({
    entry,
    stale,
    staleMinutes,
    offline,
    onReload,
    onOpenCase,
  });
  const hasLifecycleNotice = item.lifecycle !== 'active';
  const hasPreviousDeletedNotice =
    item.placement.kind === 'in-hand' && item.previous?.kind === 'deleted';
  if (banner === null && !hasLifecycleNotice && !hasPreviousDeletedNotice) return null;
  return (
    <div className="flex flex-col gap-2">
      {banner}
      {hasLifecycleNotice ? <LifecycleNoticeFor item={item} /> : null}
      {hasPreviousDeletedNotice ? <PreviousDeletedNotice item={item} /> : null}
    </div>
  );
}
