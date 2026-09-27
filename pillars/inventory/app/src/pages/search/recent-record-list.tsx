import { Clock3, MapPin } from 'lucide-react';

import { ButtonPrimitive } from '@pops/ui';

import { ItemMark } from '../../foundation/badges/item-mark.js';

import type { ItemRowModel, LocationModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { RecentRecord } from '../../inventory-web/recents.js';

/** Props for the recently opened record list. */
export interface RecentRecordListProps {
  readonly records: readonly RecentRecord[];
  readonly world: PlacementWorld;
  readonly onOpenRecord: (record: RecentRecord) => void;
}

function RecordRow({
  record,
  item,
  location,
  onOpen,
}: {
  readonly record: RecentRecord;
  readonly item: ItemRowModel | undefined;
  readonly location: LocationModel | undefined;
  readonly onOpen: () => void;
}) {
  const label = item?.name ?? location?.name ?? 'Unavailable record';
  return (
    <ButtonPrimitive
      type="button"
      role="option"
      variant="ghost"
      className="flex h-auto w-full items-center justify-start gap-3 rounded-none border-b px-3 py-3 text-left hover:bg-muted/50"
      onClick={onOpen}
      disabled={item === undefined && location === undefined}
    >
      {item !== undefined ? (
        <ItemMark item={item} />
      ) : (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
          <MapPin className="size-5" aria-hidden />
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="truncate text-sm font-medium">{label}</span>
        <span className="text-xs text-muted-foreground">
          {record.kind === 'item' ? 'Item' : 'Place'}
        </span>
      </span>
    </ButtonPrimitive>
  );
}

/** Renders recently opened item and place records. */
export function RecentRecordList({ records, world, onOpenRecord }: RecentRecordListProps) {
  if (records.length === 0) return null;
  return (
    <section aria-labelledby="recent-records-heading">
      <h2
        id="recent-records-heading"
        className="flex items-center gap-2 border-b px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
      >
        <Clock3 className="size-3.5" aria-hidden />
        Recently opened
      </h2>
      <div role="listbox" aria-label="Recently opened inventory records">
        {records.map((record) => (
          <RecordRow
            key={`${record.kind}-${record.id}`}
            record={record}
            item={record.kind === 'item' ? world.items.get(record.id) : undefined}
            location={record.kind === 'location' ? world.locations.get(record.id) : undefined}
            onOpen={() => onOpenRecord(record)}
          />
        ))}
      </div>
    </section>
  );
}
