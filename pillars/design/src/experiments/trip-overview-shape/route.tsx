import { ArrowUpRight, CalendarDays } from 'lucide-react';

import { OverviewItemCard } from './item-card';
import { RouteGap } from './route-gap';

import type { TripOverviewItem } from '@/fixtures/trip-overview';

function RouteStop({
  item,
  items,
  onSelect,
}: {
  item: TripOverviewItem;
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  const related = items.filter((candidate) => candidate.visitId === item.id);
  return (
    <article
      className="space-y-4 rounded-xl border border-dashed bg-muted/30 p-4"
      data-constraint="soft"
    >
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex min-h-11 w-full flex-wrap items-start justify-between gap-4 rounded-lg p-1 text-left hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="space-y-2">
          <span className="block text-2xl font-bold tracking-tight">{item.where}</span>
          {item.when && <span className="block text-base font-semibold">{item.when}</span>}
        </span>
        <span className="flex items-center gap-3">
          <ArrowUpRight className="size-4 shrink-0" aria-hidden />
        </span>
      </button>
      {related.length > 0 && (
        <div className="space-y-3 border-t pt-4">
          {related.map((record) => (
            <OverviewItemCard key={record.id} item={record} onSelect={onSelect} />
          ))}
        </div>
      )}
    </article>
  );
}

/** City timing stays soft; purchased child arrangements alone receive solid borders. */
export function OverviewRoute({
  items,
  onSelect,
}: {
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  const stops = items
    .filter((item) => (item.kind === 'city' || item.kind === 'gap') && item.sequence !== undefined)
    .toSorted((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  return (
    <section className="space-y-4">
      <div className="space-y-2 border-b pb-3">
        <div className="flex items-center gap-3">
          <CalendarDays className="size-5 text-app-accent" aria-hidden />
          <h2 className="text-xl font-bold tracking-tight">Route</h2>
        </div>
        <p className="text-sm leading-relaxed">
          Dashed: planned or wanted. Solid: purchased flights, stays and tickets only.
        </p>
      </div>
      {stops.length ? (
        <div className="space-y-4">
          {stops.map((item) =>
            item.kind === 'gap' ? (
              <RouteGap key={item.id} item={item} items={items} onSelect={onSelect} />
            ) : (
              <RouteStop key={item.id} item={item} items={items} onSelect={onSelect} />
            )
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed p-6">No route entries.</p>
      )}
    </section>
  );
}
