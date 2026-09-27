import { Clock3 } from 'lucide-react';

import { RecentQueryList } from './recent-query-list.js';
import { RecentRecordList } from './recent-record-list.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { RecentRecord } from '../../inventory-web/recents.js';

/** Props for the search landing state that lists local recents. */
export interface RecentsListProps {
  readonly queries: readonly string[];
  readonly records: readonly RecentRecord[];
  readonly world: PlacementWorld;
  readonly onQuery: (query: string) => void;
  readonly onOpenRecord: (record: RecentRecord) => void;
}

/** Renders recent queries and recently opened inventory records. */
export function RecentsList({ queries, records, world, onQuery, onOpenRecord }: RecentsListProps) {
  const hasContent = queries.length > 0 || records.length > 0;
  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border bg-card">
      {!hasContent ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 px-6 text-center">
          <Clock3 className="size-8 text-muted-foreground" aria-hidden />
          <p className="text-sm font-medium">No recent searches yet</p>
          <p className="max-w-sm text-sm text-muted-foreground">
            Search by item name, code, note, type, placement, merchant or order number.
          </p>
        </div>
      ) : null}
      <RecentQueryList queries={queries} onQuery={onQuery} />
      <RecentRecordList records={records} world={world} onOpenRecord={onOpenRecord} />
    </div>
  );
}
