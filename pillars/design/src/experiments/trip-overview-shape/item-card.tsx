import { isPurchasedArrangement, tripItemTier } from '@/fixtures/trip-overview-model';
import {
  ArrowUpRight,
  Check,
  Lightbulb,
  MapPin,
  Plane,
  Users,
  BedDouble,
  Ticket,
} from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import type { TripOverviewItem } from '@/fixtures/trip-overview';

const icons = {
  city: MapPin,
  transport: Plane,
  stay: BedDouble,
  event: Ticket,
  person: Users,
  idea: Lightbulb,
  gap: MapPin,
};

/** A selectable planning item; extended notes stay in its detail sheet. */
export function OverviewItemCard({
  item,
  onSelect,
}: {
  item: TripOverviewItem;
  onSelect: (item: TripOverviewItem) => void;
}) {
  const Icon = icons[item.kind];
  return (
    <button
      type="button"
      data-constraint={isPurchasedArrangement(item) ? 'hard' : 'soft'}
      onClick={() => onSelect(item)}
      className={cn(
        'flex min-h-11 w-full gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isPurchasedArrangement(item) ? 'border-l-4 border-l-app-accent' : 'border-dashed'
      )}
    >
      <Icon className="mt-1 size-5 shrink-0 text-app-accent" aria-hidden />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold leading-snug">{item.title}</span>
          <ArrowUpRight className="mt-1 size-4 shrink-0" aria-hidden />
        </span>
        {item.when && (
          <span className="block text-sm font-medium leading-relaxed">{item.when}</span>
        )}
        <span className="flex flex-wrap items-center gap-2">
          {item.kind !== 'city' && <span className="text-sm text-foreground/80">{item.where}</span>}
          {item.kind !== 'city' && <OverviewItemStatus item={item} />}
        </span>
      </span>
    </button>
  );
}

/** Booking and intention remain separate; irrelevant booking badges are omitted. */
export function OverviewItemStatus({ item }: { item: TripOverviewItem }) {
  return (
    <Badge variant={isPurchasedArrangement(item) ? 'default' : 'outline'}>
      {isPurchasedArrangement(item) && <Check className="size-3" aria-hidden />}
      {tripItemTier(item)}
    </Badge>
  );
}

/** Named collection with short rows and a distinct section heading. */
export function OverviewItemList({
  title,
  description,
  items,
  onSelect,
}: {
  title: string;
  description?: string;
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-2 border-b pb-3">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        {description && <p className="text-sm leading-relaxed text-foreground/80">{description}</p>}
      </div>
      {items.length ? (
        items.map((item) => <OverviewItemCard key={item.id} item={item} onSelect={onSelect} />)
      ) : (
        <p className="rounded-lg border border-dashed p-5 text-sm">None.</p>
      )}
    </section>
  );
}
