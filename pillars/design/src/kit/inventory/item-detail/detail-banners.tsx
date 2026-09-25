/**
 * The notices above an item's content, at most two at once: why an item is
 * inactive (when, who, the reason, and what that means), that its previous
 * place is gone, and whether this copy is stale, offline, conflicting or
 * waiting on a decision in Sync. Each states what is true and offers the one
 * action that moves it on.
 */
import { cn } from '@pops/ui';

import { INVENTORY_ICONS, StateBanner } from '../foundation';
import { dateTime } from './section-parts';

import type { ItemRowModel } from '../foundation';
import type { DetailCondition, ItemDetailModel } from './detail-model';

const MEANING: Readonly<Record<'retired' | 'discarded' | 'lost' | 'destroyed', string>> = {
  retired: 'Kept on record but out of lists unless you include inactive items.',
  discarded: 'Out of lists unless you include inactive items. Restore brings it back.',
  lost: 'Out of lists until it turns up. Found it puts it back in use.',
  destroyed: 'This is final. It cannot be restored or changed, and its history stays.',
};

function LifecycleNotice({ model }: { model: ItemDetailModel }) {
  const { item, lifecycleEvent } = model;
  if (item.lifecycle === 'active' || lifecycleEvent === undefined) return null;
  const Icon = INVENTORY_ICONS[item.lifecycle];
  return (
    <div
      role="status"
      className={cn(
        'flex items-start gap-3 rounded-lg border px-3 py-2',
        item.lifecycle === 'destroyed' ? 'bg-muted' : 'bg-card'
      )}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
      <div className="min-w-0 text-sm">
        <p className="font-medium">
          {lifecycleEvent.summary} {dateTime(lifecycleEvent.at)} by {lifecycleEvent.actorName}
          {lifecycleEvent.reason ? `: ${lifecycleEvent.reason}` : ''}
        </p>
        <p className="text-xs text-muted-foreground">{MEANING[item.lifecycle]}</p>
      </div>
    </div>
  );
}

function PreviousDeletedNotice({ item }: { item: ItemRowModel }) {
  if (item.placement.kind !== 'in-hand' || item.previous?.kind !== 'deleted') return null;
  return (
    <StateBanner
      kind="needs-attention"
      title={`Picked up from ${item.previous.name}, which has since been deleted.`}
      detail="Put back has nowhere to go. Move it to choose a new place."
    />
  );
}

function ConditionBanner({ condition }: { condition: DetailCondition }) {
  if (condition.conflict) {
    const { label, mine, theirs, theirsBy } = condition.conflict;
    return (
      <StateBanner
        kind="conflict"
        title={`${label} was changed on ${theirsBy} while you were editing it.`}
        detail={
          <span>
            Yours: <span className="font-medium text-foreground">{mine}</span>. Theirs:{' '}
            <span className="font-medium text-foreground">{theirs}</span>. Nothing is lost until you
            choose.
          </span>
        }
        actionLabel="Resolve in Sync"
      />
    );
  }
  switch (condition.banner) {
    case 'stale':
      return (
        <StateBanner
          kind="stale"
          title="Changed on Joao's iPhone 2 minutes ago."
          detail="This page shows it as it was before. Reload to see the change."
          actionLabel="Reload"
        />
      );
    case 'offline':
      return (
        <StateBanner
          kind="offline"
          title="No connection. Showing what loaded."
          detail="Changes are off until the connection returns."
        />
      );
    case 'needs-attention':
      return (
        <StateBanner
          kind="needs-attention"
          title="Its type changed: Warranty registered was archived."
          detail="The value is kept in history but no longer shows as a field. Decide in Sync."
          actionLabel="Open in Sync"
        />
      );
    default:
      return null;
  }
}

/** Every notice that applies, in priority order. */
export function DetailBanners({
  model,
  condition,
}: {
  model: ItemDetailModel;
  condition: DetailCondition;
}) {
  return (
    <div className="flex shrink-0 flex-col gap-2 empty:hidden">
      <ConditionBanner condition={condition} />
      <LifecycleNotice model={model} />
      <PreviousDeletedNotice item={model.item} />
    </div>
  );
}
