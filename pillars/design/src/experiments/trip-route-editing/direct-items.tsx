import { presentTripRecord } from '@/fixtures/trip-overview-format';
import { isPurchasedArrangement, tripItemTier } from '@/fixtures/trip-overview-model';
import { GripVertical } from 'lucide-react';

import { Badge, cn } from '@pops/ui';

import { outsideVisit } from './constraints';

import type { TripRecord } from '@/fixtures/trip-overview-model';

/** Arrangement drag payloads retain their original dates, purchase and location. */
export const tripItemDragType = 'application/x-pops-trip-item';

/** Drag events and arrangements between visit cards without opening a detail screen. */
export function DirectItems({ visit, records }: { visit: TripRecord; records: TripRecord[] }) {
  return (
    <ul className="space-y-2">
      {records
        .filter((r) => r.visitId === visit.id)
        .map((item) => {
          const display = presentTripRecord(item, records);
          const paid = isPurchasedArrangement(item);
          return (
            <li
              key={item.id}
              draggable
              aria-label={`Drag ${display.title}`}
              className={cn(
                'cursor-grab rounded-lg border p-3 active:cursor-grabbing',
                paid ? 'border-l-4 border-l-app-accent' : 'border-dashed'
              )}
              onDragStart={(e) => {
                e.stopPropagation();
                e.dataTransfer.setData(tripItemDragType, item.id);
                e.dataTransfer.effectAllowed = 'move';
              }}
            >
              <div className="flex items-start gap-2">
                <GripVertical className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-sm font-semibold">{display.title}</span>
                    <Badge variant={paid ? 'default' : 'outline'}>{tripItemTier(item)}</Badge>
                  </div>
                  {display.when && <p className="mt-1 text-sm">{display.when}</p>}
                </div>
              </div>
              <ItemFlags visit={visit} item={item} />
            </li>
          );
        })}
    </ul>
  );
}

function ItemFlags({ visit, item }: { visit: TripRecord; item: TripRecord }) {
  if (item.kind === 'transport') return null;
  return (
    <div className="space-y-1 text-xs font-medium text-destructive">
      {outsideVisit(visit, item) && <p>Outside visit dates</p>}
      {item.placeId !== visit.placeId && <p>Different location</p>}
    </div>
  );
}
