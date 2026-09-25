/**
 * `/inventory/sync`: one page, two segments (owner decision 1). Activity is
 * what happened; Sync is what needs a person. The segment is in the URL
 * (`segment=activity|attention|waiting|resolved`), so `g a` and `g s` both
 * land here on the right one.
 */
import { useState } from 'react';

import { ActivityFeed } from '../activity/activity-feed';
import { InventoryPage, ToastDock } from '../overview/inventory-page';
import { INVENTORY_ICONS } from '../shared/icons';
import { Segmented } from './segmented';
import { SyncSegment } from './sync-segment';

import type { ReactNode } from 'react';

import type { ActivityFeedProps } from '../activity/activity-feed';
import type { SyncSegment as ListSegment } from './sync-model';
import type { SyncSegmentProps } from './sync-segment';

/** Which half of the page is showing. */
export type SyncPageSegment = 'activity' | 'sync';

/** Props for {@link SyncPage}. */
export interface SyncPageProps {
  segment: SyncPageSegment;
  activity: Omit<ActivityFeedProps, 'disabledReason'>;
  sync: Omit<SyncSegmentProps, 'onSegment' | 'disabledReason'>;
  banner?: ReactNode;
  disabledReason?: string;
  toast?: ReactNode;
  /** A blocking layer over the whole page. */
  blocker?: ReactNode;
}

/** The page. */
export function SyncPage(props: SyncPageProps) {
  const [segment, setSegment] = useState<SyncPageSegment>(props.segment);
  const [list, setList] = useState<ListSegment>(props.sync.segment);
  const attention = props.sync.ledger.attention.length;
  return (
    <div className="relative">
      <InventoryPage
        title="Sync"
        icon={INVENTORY_ICONS.sync}
        banner={props.banner}
        className="gap-3"
        actions={
          <Segmented
            label="Show"
            value={segment}
            onChange={setSegment}
            segments={[
              { id: 'activity', label: 'Activity' },
              { id: 'sync', label: 'Sync', count: attention, alert: true },
            ]}
          />
        }
        overlay={props.toast ? <ToastDock>{props.toast}</ToastDock> : undefined}
      >
        {segment === 'activity' ? (
          <ActivityFeed {...props.activity} disabledReason={props.disabledReason} />
        ) : (
          <SyncSegment
            {...props.sync}
            segment={list}
            onSegment={setList}
            disabledReason={props.disabledReason}
          />
        )}
      </InventoryPage>
      {props.blocker}
    </div>
  );
}
