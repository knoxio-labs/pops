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
      onClick={() => onSelect(item)}
      className={cn(
        'flex min-h-11 w-full gap-3 rounded-lg border bg-card p-4 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        item.intention === 'Alternative' && 'border-dashed'
      )}
    >
      <Icon className="mt-1 size-5 shrink-0 text-app-accent" aria-hidden />
      <span className="min-w-0 flex-1 space-y-2">
        <span className="flex items-start justify-between gap-3">
          <span className="text-base font-semibold leading-snug">{item.title}</span>
          <ArrowUpRight className="mt-1 size-4 shrink-0" aria-hidden />
        </span>
        <span className="block text-sm font-medium leading-relaxed">{item.when}</span>
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-foreground/80">{item.where}</span>
          <OverviewItemStatus item={item} />
        </span>
      </span>
    </button>
  );
}

/** Booking and intention remain separate; irrelevant booking badges are omitted. */
export function OverviewItemStatus({ item }: { item: TripOverviewItem }) {
  if (item.arrangement === 'Booked')
    return (
      <Badge>
        <Check className="size-3" aria-hidden />
        Booked
      </Badge>
    );
  if (item.arrangement === 'Agreed') return <Badge variant="secondary">Agreed</Badge>;
  return (
    <Badge variant="outline">
      {item.intention === 'In plan' ? 'Chosen · to arrange' : item.intention}
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
  description: string;
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  return (
    <section className="space-y-4">
      <div className="space-y-2 border-b pb-3">
        <h2 className="text-xl font-bold tracking-tight">{title}</h2>
        <p className="text-sm leading-relaxed text-foreground/80">{description}</p>
      </div>
      {items.length ? (
        items.map((item) => <OverviewItemCard key={item.id} item={item} onSelect={onSelect} />)
      ) : (
        <p className="rounded-lg border border-dashed p-5 text-sm">
          Nothing here yet. Add something without choosing dates.
        </p>
      )}
    </section>
  );
}

/** Open decision with options visually subordinate to its question. */
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
    <article className="space-y-4 border-l-4 border-l-app-accent bg-muted p-5">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Lightbulb className="size-4 text-app-accent" aria-hidden />
        Decision
      </div>
      <h3 className="text-xl font-bold leading-snug">{title}</h3>
      <p className="text-sm leading-relaxed text-foreground/90">{description}</p>
      <div className="flex flex-col gap-2">
        {options.map((item) => (
          <Button
            key={item.id}
            variant="outline"
            className="h-auto min-h-11 justify-between whitespace-normal py-3 text-left"
            onClick={() => onSelect(item)}
          >
            <span>{item.title}</span>
            <ArrowUpRight className="size-4 shrink-0" aria-hidden />
          </Button>
        ))}
      </div>
    </article>
  );
}
