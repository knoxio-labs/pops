import { Card, cn } from '@pops/ui';

import { Segmented } from '../../foundation/frame/segmented.js';
import { RepairSheet } from './repair/repair-sheet.js';
import { casePosition, segmentCounts } from './sync-model.js';
import { Devices, Rows } from './sync-segment-content.js';

import type { ReactElement, ReactNode } from 'react';

import type { SyncLedger, SyncSegment as Segment } from './sync-model.js';

/** Props for {@link SyncSegment}. */
export interface SyncSegmentProps {
  ledger: SyncLedger;
  segment: Segment;
  now: string;
  /** The case or resolved entry shown by a sheet; its row is marked active. */
  openId: string | null;
  /** The sheet beside the list, when a later ticket supplies one. */
  sheet?: ReactNode;
  onSegment: (segment: Segment) => void;
  onOpenCase: (id: string) => void;
  onOpenResolved: (id: string) => void;
  disabledReason?: string;
  onCloseCase: () => void;
  onStepCase: (id: string) => void;
}

function SegmentHeader({
  ledger,
  segment,
  now,
  counts,
  onSegment,
}: {
  ledger: SyncLedger;
  segment: Segment;
  now: string;
  counts: Record<Segment, number>;
  onSegment: (segment: Segment) => void;
}): ReactElement {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Segmented
        label="Sync lists"
        variant="line"
        value={segment}
        onChange={onSegment}
        segments={[
          { id: 'attention', label: 'Needs attention', count: counts.attention, alert: true },
          { id: 'waiting', label: 'Waiting', count: counts.waiting },
          { id: 'resolved', label: 'Resolved', count: counts.resolved },
        ]}
      />
      <Devices ledger={ledger} now={now} />
    </div>
  );
}

function SegmentList({
  props,
  sheet,
}: {
  props: SyncSegmentProps;
  sheet: ReactNode;
}): ReactElement {
  const hasSheet = sheet !== null;
  return (
    <div
      className={
        hasSheet
          ? 'relative flex min-h-0 flex-1 xl:grid xl:grid-cols-[minmax(0,1fr)_30rem] xl:gap-3'
          : 'flex min-h-0 flex-1'
      }
    >
      <Card className="min-h-0 min-w-0 flex-1 overflow-hidden py-0">
        <ul
          className={cn(
            'h-full divide-y divide-border/60 overflow-y-auto',
            hasSheet && '[&_[data-meta]]:hidden'
          )}
        >
          <Rows
            ledger={props.ledger}
            segment={props.segment}
            now={props.now}
            openId={props.openId}
            onOpenCase={props.onOpenCase}
            onOpenResolved={props.onOpenResolved}
          />
        </ul>
      </Card>
      {hasSheet ? (
        <div className="absolute inset-y-0 right-0 z-10 flex max-w-full shadow-xl xl:static xl:min-h-0 xl:shadow-none max-xl:[&>section]:w-120 xl:[&>section]:w-full">
          {sheet}
        </div>
      ) : null}
    </div>
  );
}

function openRepairSheet(props: SyncSegmentProps): ReactNode {
  if (props.sheet !== undefined) return props.sheet;
  if (props.segment !== 'attention' || props.openId === null) return null;
  const repair = props.ledger.attention.find((entry) => entry.id === props.openId);
  if (repair === undefined) return null;
  return (
    <RepairSheet
      repair={repair}
      device={
        props.ledger.devices.find((device) => device.id === repair.deviceId)?.name ??
        'An unknown device'
      }
      now={props.now}
      position={casePosition(props.ledger.attention, repair.id)}
      disabledReason={props.disabledReason}
      onStep={props.onStepCase}
      onClose={props.onCloseCase}
    />
  );
}

/** Renders the read-only Sync lists and their device status line. */
export function SyncSegment(props: SyncSegmentProps): ReactElement {
  const counts = segmentCounts(props.ledger);
  const sheet = openRepairSheet(props);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SegmentHeader
        ledger={props.ledger}
        segment={props.segment}
        now={props.now}
        counts={counts}
        onSegment={props.onSegment}
      />
      <SegmentList props={props} sheet={sheet} />
    </div>
  );
}
