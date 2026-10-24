import { GitBranch } from 'lucide-react';

import { OverviewItemCard } from './item-card';

import type { TripOverviewItem } from '@/fixtures/trip-overview';

/** Alternatives belong to one open segment, not consecutive stops on the route. */
export function RouteGap({
  item,
  items,
  onSelect,
}: {
  item: TripOverviewItem;
  items: TripOverviewItem[];
  onSelect: (item: TripOverviewItem) => void;
}) {
  const options = items.filter((option) => item.optionIds?.includes(option.id));
  return (
    <section
      className="space-y-4 rounded-xl border-2 border-dashed p-5"
      aria-label="Open route segment"
    >
      <div className="flex items-start gap-3">
        <GitBranch className="mt-1 size-5 text-app-accent" aria-hidden />
        <div>
          <h3 className="text-lg font-bold">{item.when}</h3>
          <p className="mt-1 text-sm">
            {options.length} {options.length === 1 ? 'alternative' : 'alternatives'}
          </p>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {options.map((option) => (
          <div key={option.id} className="space-y-2">
            <OverviewItemCard item={option} onSelect={onSelect} />
            {items
              .filter((record) => record.visitId === option.id)
              .map((record) => (
                <OverviewItemCard key={record.id} item={record} onSelect={onSelect} />
              ))}
          </div>
        ))}
      </div>
    </section>
  );
}
