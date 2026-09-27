import { useState } from 'react';
import { useNavigate } from 'react-router';

import { staleChangeLine, staleTitle } from '../../foundation/feedback/changed-elsewhere-copy.js';
import { OFFLINE_TITLE, StateBanner } from '../../foundation/feedback/state-banner.js';
import { PlacementPicker } from '../../foundation/placement-picker/placement-picker.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useOverviewActions } from './overview-page-actions.js';
import { bodyState, useOverviewReads, type OverviewReads } from './overview-page-reads.js';

import type { ReactElement } from 'react';

import type { EventModel, ItemRowModel } from '../../foundation/model/model.js';
import type { PlacementWorld } from '../../foundation/model/placement-model.js';

type Navigate = ReturnType<typeof useNavigate>;
type Attention = OverviewReads['attention'];
type Changed = OverviewReads['changed'];

function attentionTitle(attentionCount: number, devices: Attention['devices']): string {
  const holdingDevices = devices.filter((device) => device.attentionCount > 0);
  if (holdingDevices.length === 1) {
    const device = holdingDevices[0];
    return `${attentionCount} change${attentionCount === 1 ? '' : 's'} from ${device?.name ?? 'a device'} ${attentionCount === 1 ? 'needs' : 'need'} a decision.`;
  }
  if (holdingDevices.length > 1) {
    return `${attentionCount} changes from ${holdingDevices.length} devices need a decision.`;
  }
  return `${attentionCount} change${attentionCount === 1 ? '' : 's'} need a decision.`;
}

function banner({
  online,
  attention,
  changed,
  now,
  navigate,
  refetchAll,
}: {
  online: boolean;
  attention: Attention;
  changed: Changed;
  now: string;
  navigate: Navigate;
  refetchAll: () => void;
}): ReactElement | null {
  if (!online) {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Close, Put back, Move and Undo are off until the connection is back."
        actionLabel="Retry"
        onAction={refetchAll}
      />
    );
  }
  if (attention.attentionCount !== null && attention.attentionCount > 0) {
    const devices = attention.devices.filter((device) => device.attentionCount > 0);
    return (
      <StateBanner
        kind="needs-attention"
        title={attentionTitle(attention.attentionCount, devices)}
        detail="Until then they stay on the phone, and the items show Needs attention."
        actionLabel="Review in Sync"
        onAction={() => void navigate('/inventory/sync')}
      />
    );
  }
  if (!changed.stale) return null;
  return (
    <StateBanner
      kind="stale"
      title={staleTitle(null, changed.groups, now)}
      detail={`${staleChangeLine(changed.groups)}; nothing here changes on its own.`}
      actionLabel="Reload"
      onAction={() => void changed.reload()}
    />
  );
}

function pickerOverlay({
  reads,
  actions,
  pickerItemId,
  setPickerItemId,
}: {
  reads: OverviewReads;
  actions: ReturnType<typeof useOverviewActions>;
  pickerItemId: string | null;
  setPickerItemId: (id: string | null) => void;
}): ReactElement | null {
  if (pickerItemId === null || !reads.world.items.has(pickerItemId)) return null;
  return (
    <PlacementPicker
      world={reads.pickerWorld}
      subject={reads.pickerSubject}
      recents={reads.pickerRecents}
      onPick={actions.pick}
      onCreatePlace={actions.createPlace}
      trigger={<span aria-hidden className="fixed right-1/3 bottom-28 size-px" />}
      open
      onOpenChange={(open) => {
        if (!open) setPickerItemId(null);
      }}
    />
  );
}

/** The complete data and action model consumed by the Overview page view. */
export interface OverviewPageModel {
  readonly navigate: Navigate;
  readonly online: boolean;
  readonly body: 'loading' | 'error' | 'first-run' | 'panels';
  readonly banner: ReactElement | null;
  readonly overlay: ReactElement | null;
  readonly summary: ReturnType<typeof useOverviewReads>['summary'];
  readonly openContainers: ReturnType<typeof useOverviewReads>['openContainers'];
  readonly inHand: ReturnType<typeof useOverviewReads>['inHand'];
  readonly events: readonly EventModel[];
  readonly world: PlacementWorld;
  readonly rejections: Readonly<Record<string, string>>;
  readonly pendingIds: ReadonlySet<string>;
  readonly retry: () => void;
  readonly now: string;
  readonly close: (item: ItemRowModel) => Promise<void>;
  readonly put: (item: ItemRowModel) => Promise<void>;
  readonly openMove: (item: ItemRowModel) => void;
  readonly undo: (event: EventModel) => void;
}

/** Loads Overview data, builds its state banner, and wires its row actions. */
export function useOverviewPageModel(): OverviewPageModel {
  const navigate = useNavigate();
  const online = useOnline();
  const [pickerItemId, setPickerItemId] = useState<string | null>(null);
  const reads = useOverviewReads(pickerItemId);
  const actions = useOverviewActions({
    world: reads.world,
    pickerWorld: reads.pickerWorld,
    pickerItemId,
    setPickerItemId,
    eventById: reads.eventById,
    navigate,
    createLocation: reads.createLocation,
  });
  return {
    navigate,
    online,
    body: bodyState(reads),
    banner: banner({
      online,
      attention: reads.attention,
      changed: reads.changed,
      now: reads.now,
      navigate,
      refetchAll: reads.refetchAll,
    }),
    overlay: pickerOverlay({ reads, actions, pickerItemId, setPickerItemId }),
    summary: reads.summary,
    openContainers: reads.openContainers,
    inHand: reads.inHand,
    events: reads.eventModels,
    world: reads.world,
    rejections: actions.rejections,
    pendingIds: actions.pendingIds,
    retry: reads.refetchAll,
    now: reads.now,
    close: actions.close,
    put: actions.put,
    openMove: actions.openMove,
    undo: actions.undo,
  };
}
