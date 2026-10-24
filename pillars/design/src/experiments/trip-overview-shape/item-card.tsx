import {
  ArrowUpRight,
  CalendarDays,
  Lightbulb,
  MapPin,
  Plane,
  Users,
  BedDouble,
  Ticket,
} from 'lucide-react';

import { Badge, Button, cn } from '@pops/ui';

import type { TripOverviewItem } from '@/fixtures/trip-overview';

const icons = {
  city: MapPin,
  transport: Plane,
  stay: BedDouble,
  event: Ticket,
  person: Users,
  idea: Lightbulb,
};

/** One selectable item, preserving separate intention and arrangement labels. */
export function OverviewItemCard({
  item,
  onSelect,
  compact = false,
}: {
  item: TripOverviewItem;
  onSelect: (item: TripOverviewItem) => void;
  compact?: boolean;
}) {
  const Icon = icons[item.kind];
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        'group flex min-h-11 w-full gap-3 rounded-xl border bg-card p-4 text-left transition-colors hover:border-app-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        item.intention === 'Alternative' && 'border-dashed'
      )}
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="min-w-0 flex-1 space-y-2">
        <span className="flex items-start justify-between gap-2">
          <span className="font-medium">{item.title}</span>
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        </span>
        <span className="block text-xs text-muted-foreground">
          {item.where} · {item.when}
        </span>
        {!compact && <span className="block text-sm text-muted-foreground">{item.notes}</span>}
        <span className="flex flex-wrap gap-1.5">
          <Badge variant={item.intention === 'In plan' ? 'secondary' : 'outline'}>
            {item.intention}
          </Badge>
          <Badge variant={item.arrangement === 'Booked' ? 'default' : 'outline'}>
            {item.arrangement}
          </Badge>
        </span>
      </span>
    </button>
  );
}

/** Named group of items using the same control in all proposals. */
export function OverviewItemList({
  title,
  description,
  items,
  onSelect,
  compact = true,
}: {
  title: string;
  description: string;
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
  compact?: boolean;
}) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      {items.length ? (
        items.map((item) => (
          <OverviewItemCard key={item.id} item={item} onSelect={onSelect} compact={compact} />
        ))
      ) : (
        <div className="rounded-xl border border-dashed p-6 text-sm text-muted-foreground">
          Nothing here yet. Add something without choosing dates.
        </div>
      )}
    </section>
  );
}

/** Route block with a visible distinction between a chosen visit and an option. */
export function OverviewRoute({
  items,
  onSelect,
}: {
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  const stops = items.filter((item) => item.kind === 'city');
  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <CalendarDays className="size-5 text-app-accent" aria-hidden />
        <h2 className="text-lg font-semibold">The shape of the trip</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        A working route, with room to change. Return date open.
      </p>
      {stops.length ? (
        stops.map((item, index) => (
          <div key={item.id} className="flex gap-4">
            <div className="flex w-6 shrink-0 flex-col items-center gap-2">
              <span className="flex size-6 items-center justify-center rounded-full border bg-background text-xs text-muted-foreground">
                {index + 1}
              </span>
              <span className="w-px flex-1 bg-border" />
            </div>
            <div className="min-w-0 flex-1 space-y-2 pb-3">
              <OverviewItemCard item={item} onSelect={onSelect} />
              <p className="text-xs text-muted-foreground">
                {index === stops.length - 1
                  ? 'After this: open'
                  : 'Connection and dates still flexible'}
              </p>
            </div>
          </div>
        ))
      ) : (
        <div className="rounded-xl border border-dashed p-8 text-muted-foreground">
          No route yet. Start with a city, a person or an idea.
        </div>
      )}
    </section>
  );
}

/** Open question with options that lead to item inspection rather than implicit booking. */
export function OverviewDecision({
  title,
  description,
  options,
  onSelect,
}: {
  title: string;
  description: string;
  options: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  return (
    <article className="space-y-3 rounded-xl border bg-card p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-app-accent">
        <Lightbulb className="size-4" aria-hidden />
        Open decision
      </div>
      <h3 className="text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((item) => (
          <Button key={item.id} variant="outline" onClick={() => onSelect(item)}>
            {item.title}
            <ArrowUpRight className="size-4" aria-hidden />
          </Button>
        ))}
      </div>
    </article>
  );
}
