import { ArrowUpRight, CalendarDays, Check, CircleDashed } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import type { TripOverviewItem } from '@/fixtures/trip-overview';

function RouteStop({
  item,
  onSelect,
}: {
  item: TripOverviewItem;
  onSelect: (item: TripOverviewItem) => void;
}) {
  const chosen = item.intention === 'In plan';
  return (
    <button
      type="button"
      onClick={() => onSelect(item)}
      className={cn(
        'grid min-h-11 w-full gap-4 rounded-xl border p-5 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-3',
        chosen ? 'border-l-4 border-l-app-accent bg-card' : 'border-dashed bg-muted/40'
      )}
    >
      <span className="space-y-3">
        <span className="block text-base font-semibold leading-snug">{item.when}</span>
        <Badge variant={chosen ? 'secondary' : 'outline'}>
          {chosen ? (
            <Check className="size-3" aria-hidden />
          ) : (
            <CircleDashed className="size-3" aria-hidden />
          )}
          {chosen ? 'In the plan' : item.intention}
        </Badge>
      </span>
      <span className="space-y-2 md:col-span-2">
        <span className="flex items-center justify-between gap-3">
          <span className="text-2xl font-bold tracking-tight">{item.where}</span>
          <ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </span>
      </span>
    </button>
  );
}

/** City names and dates lead; dashed options remain distinct from chosen visits. */
export function OverviewRoute({
  items,
  onSelect,
}: {
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  const stops = items.filter((item) => item.kind === 'city');
  return (
    <section className="space-y-4">
      <div className="space-y-2 border-b pb-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-5 text-app-accent" aria-hidden />
          <h2 className="text-xl font-bold tracking-tight">Route</h2>
        </div>
        <p className="text-sm leading-relaxed text-foreground/80">
          Solid: in plan. Dashed: considering. Transport shown separately.
        </p>
      </div>
      {stops.length ? (
        <div className="space-y-4">
          {stops.map((item) => (
            <RouteStop key={item.id} item={item} onSelect={onSelect} />
          ))}
          <p className="border-t pt-4 text-sm font-medium">Return date not set.</p>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6">
          No route yet. Start with a city, a person or an idea.
        </p>
      )}
    </section>
  );
}
