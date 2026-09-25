/**
 * The Sync segment: which devices reported when, the three lists (needs
 * attention, waiting, resolved), and the open case beside the list. The
 * list scrolls; the sheet's body scrolls; nothing else does.
 */
import { Smartphone } from 'lucide-react';

import { Card, EmptyState, cn } from '@pops/ui';

import { formatWhen } from '../activity/when';
import { CaseRow, ResolvedRow, WaitingRow } from './ledger-rows';
import { RepairSheet } from './repair-sheet';
import { Segmented } from './segmented';
import { casePosition, deviceName, orderCases, segmentCounts } from './sync-model';

import type { ReactNode } from 'react';

import type { SyncLedger, SyncSegment as Segment } from './sync-model';

/** Props for {@link SyncSegment}. */
export interface SyncSegmentProps {
  ledger: SyncLedger;
  segment: Segment;
  now: string;
  /** The open case, drawn in the sheet beside the list. */
  openCaseId?: string;
  /** A sheet other than a case's: settled, let go. */
  sheet?: ReactNode;
  disabledReason?: string;
  onSegment?: (segment: Segment) => void;
}

function Devices({ ledger, now }: { ledger: SyncLedger; now: string }) {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      {ledger.devices.map((device) => (
        <span key={device.id} className="inline-flex items-center gap-1.5">
          <Smartphone className="size-3.5" aria-hidden />
          <span className="text-foreground">{device.name}</span> last synced{' '}
          {formatWhen(device.lastSyncAt, now)}
        </span>
      ))}
    </p>
  );
}

function AllClear({ ledger }: { ledger: SyncLedger }) {
  return (
    <EmptyState
      icon={Smartphone}
      title="Nothing needs a decision"
      description={`Every change from ${ledger.devices.map((device) => device.name).join(' and ')} was saved. Anything a phone cannot send on its own shows here.`}
      size="md"
    />
  );
}

function Rows({ ledger, segment, now, openCaseId }: SyncSegmentProps) {
  const { devices } = ledger;
  if (segment === 'attention') {
    if (ledger.attention.length === 0) return <AllClear ledger={ledger} />;
    return orderCases(ledger.attention).map((repair) => (
      <CaseRow
        key={repair.id}
        repair={repair}
        devices={devices}
        now={now}
        active={repair.id === openCaseId}
      />
    ));
  }
  if (segment === 'waiting') {
    if (ledger.waiting.length === 0) {
      return <EmptyState icon={Smartphone} title="No device is holding a change" size="md" />;
    }
    return ledger.waiting.map((change) => (
      <WaitingRow key={change.id} change={change} devices={devices} now={now} />
    ));
  }
  return ledger.resolved.map((entry) => (
    <ResolvedRow key={entry.id} entry={entry} devices={devices} now={now} />
  ));
}

function OpenSheet(props: SyncSegmentProps) {
  if (props.sheet) return props.sheet;
  const cases = orderCases(props.ledger.attention);
  const repair = cases.find((entry) => entry.id === props.openCaseId);
  if (!repair) return null;
  return (
    <RepairSheet
      repair={repair}
      device={deviceName(props.ledger.devices, repair.deviceId)}
      now={props.now}
      position={casePosition(cases, repair.id)}
      disabledReason={props.disabledReason}
    />
  );
}

/** The segment body. */
export function SyncSegment(props: SyncSegmentProps) {
  const counts = segmentCounts(props.ledger);
  const sheet = <OpenSheet {...props} />;
  const hasSheet = props.sheet !== undefined || props.openCaseId !== undefined;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Segmented
          label="Sync lists"
          variant="line"
          value={props.segment}
          onChange={props.onSegment}
          segments={[
            { id: 'attention', label: 'Needs attention', count: counts.attention, alert: true },
            { id: 'waiting', label: 'Waiting', count: counts.waiting },
            { id: 'resolved', label: 'Resolved', count: counts.resolved },
          ]}
        />
        <Devices ledger={props.ledger} now={props.now} />
      </div>
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
            <Rows {...props} />
          </ul>
        </Card>
        {hasSheet ? (
          <div className="absolute inset-y-0 right-0 z-10 flex max-w-full shadow-xl xl:static xl:min-h-0 xl:shadow-none [&>section]:w-120 xl:[&>section]:w-full">
            {sheet}
          </div>
        ) : null}
      </div>
    </div>
  );
}
