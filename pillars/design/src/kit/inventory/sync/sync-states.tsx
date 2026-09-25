/**
 * Every review state of the Sync page, built once so `sync.tsx` and the
 * Activity playground screen show the same page. Activity states render the
 * Activity segment; repair states open one case beside the Needs attention
 * list.
 */
import { activityEvents, monitorMoveEvent, screenSizeEvent } from '@/fixtures/inventory/activity';
import { DESIGN_NOW, iphone } from '@/fixtures/inventory/sync-cases';
import {
  busyLedger,
  clearLedger,
  letGoEntry,
  settledEntry,
  settledLedger,
} from '@/fixtures/inventory/sync-ledger';

import { NO_FILTER } from '../activity/activity-model';
import { StateBanner } from '../shared/state-banner';
import { UndoToast } from '../shared/undo-toast';
import { ReloadRequired, SessionExpired } from './interruptions';
import { LetGoSheet, SettledSheet } from './outcome-sheets';
import { SyncPage } from './sync-page';

import type { ComponentType } from 'react';

import type { RepairCase, SyncLedger } from './sync-model';
import type { SyncPageProps } from './sync-page';

const BASE: SyncPageProps = {
  segment: 'sync',
  activity: { events: activityEvents, now: DESIGN_NOW },
  sync: { ledger: busyLedger, segment: 'attention', now: DESIGN_NOW },
};

type Patch = Partial<Omit<SyncPageProps, 'activity' | 'sync'>> & {
  activity?: Partial<SyncPageProps['activity']>;
  sync?: Partial<SyncPageProps['sync']>;
};

/** One state: the base page with a patch applied. */
export function syncState(patch: Patch): ComponentType {
  const props: SyncPageProps = {
    ...BASE,
    ...patch,
    activity: { ...BASE.activity, ...patch.activity },
    sync: { ...BASE.sync, ...patch.sync },
  };
  return function SyncState() {
    return <SyncPage {...props} />;
  };
}

/** A case opened beside the list; cases not in the busy ledger join it. */
export function repairState(repair: RepairCase): ComponentType {
  const known = busyLedger.attention.some((entry) => entry.id === repair.id);
  const ledger: SyncLedger = known
    ? busyLedger
    : { ...busyLedger, attention: [...busyLedger.attention, repair] };
  return syncState({ sync: { ledger, openCaseId: repair.id } });
}

const OFFLINE = 'No connection. Changes are off until it is back';

const offlineBanner = (
  <StateBanner
    kind="offline"
    title="No connection. Showing what loaded at 10:42."
    detail="Web actions and Undo are off until the connection is back."
    actionLabel="Retry"
  />
);

/** The Activity segment's states, unprefixed. */
export const activityStates: Readonly<Record<string, ComponentType>> = {
  default: syncState({ segment: 'activity' }),
  filtered: syncState({
    segment: 'activity',
    activity: { initialFilter: { ...NO_FILTER, group: 'placement', actor: 'web' } },
  }),
  empty: syncState({ segment: 'activity', activity: { events: [] } }),
  'empty-filtered': syncState({
    segment: 'activity',
    activity: { initialFilter: { ...NO_FILTER, query: 'snorkel' } },
  }),
  'event-detail': syncState({ segment: 'activity', activity: { openEventId: screenSizeEvent.id } }),
  'undo-conflict': syncState({
    segment: 'activity',
    toast: (
      <UndoToast
        concept="move"
        message={`${monitorMoveEvent.itemName}: ${monitorMoveEvent.summary}`}
        state="conflict"
      />
    ),
  }),
  loading: syncState({ segment: 'activity', activity: { loading: true } }),
  offline: syncState({ segment: 'activity', disabledReason: OFFLINE, banner: offlineBanner }),
};

/** The Sync segment's list, all-clear, outcome and interruption states. */
export const ledgerStates: Readonly<Record<string, ComponentType>> = {
  attention: syncState({}),
  waiting: syncState({ sync: { segment: 'waiting' } }),
  resolved: syncState({ sync: { segment: 'resolved' } }),
  'all-clear': syncState({ sync: { ledger: clearLedger } }),
  'repair-let-go': syncState({
    sync: {
      segment: 'resolved',
      sheet: <LetGoSheet entry={letGoEntry} device={iphone.name} now={DESIGN_NOW} />,
    },
  }),
  'repair-settled': syncState({
    sync: {
      ledger: settledLedger,
      sheet: (
        <SettledSheet
          entry={settledEntry}
          device={iphone.name}
          now={DESIGN_NOW}
          remaining={settledLedger.attention.length}
        />
      ),
    },
  }),
  'reload-required': syncState({
    disabledReason: 'Reload to keep making changes',
    toast: <ReloadRequired />,
  }),
  'session-expired': syncState({ blocker: <SessionExpired /> }),
  offline: syncState({
    disabledReason: OFFLINE,
    banner: offlineBanner,
    sync: { openCaseId: busyLedger.attention[0]?.id },
  }),
  stale: syncState({
    banner: (
      <StateBanner
        kind="stale"
        title="Joao's iPhone reported 2 changes since this loaded."
        detail="Reload to see them. The open case stays until you do."
        actionLabel="Reload"
      />
    ),
  }),
};
