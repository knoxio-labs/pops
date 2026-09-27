import { Smartphone } from 'lucide-react';

import { Card, EmptyState, cn } from '@pops/ui';

import { formatWhen } from '../../foundation/feedback/when.js';
import { Segmented } from '../../foundation/frame/segmented.js';
import { ListError, ListSkeleton } from '../../foundation/list-page/list-states.js';
import { CaseRow, ResolvedRow, WaitingRow } from './ledger-rows.js';
import { RepairSheet } from './repair/repair-sheet.js';
import { casePosition, segmentCounts, toSyncLedger } from './sync-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { useSyncLedger } from '../../inventory-web/useSyncLedger.js';
import type { SyncLedger, SyncSegment as Segment } from './sync-model.js';

/** Props for the loaded, pending, or failed Sync ledger body. */
export interface SyncLedgerBodyProps {
  status: ReturnType<typeof useSyncLedger>['status'];
  ledger: ReturnType<typeof useSyncLedger>['ledger'];
  segment: Segment;
  now: string;
  openId: string | null;
  onSegment: (segment: Segment) => void;
  onOpenCase: (id: string) => void;
  onOpenResolved: (id: string) => void;
  onRetry: () => void;
  disabledReason?: string;
  onCloseCase: () => void;
  onStepCase: (id: string) => void;
}

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

function Devices({ ledger, now }: { ledger: SyncLedger; now: string }): ReactElement {
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

function AllClear({ ledger }: { ledger: SyncLedger }): ReactElement {
  const names = ledger.devices.map((device) => device.name);
  const description =
    names.length === 0
      ? 'Anything a phone cannot send on its own shows here.'
      : `Every change from ${names.join(' and ')} was saved. Anything a phone cannot send on its own shows here.`;
  return (
    <EmptyState
      icon={Smartphone}
      title="Nothing needs a decision"
      description={description}
      size="md"
    />
  );
}

function Rows({
  ledger,
  segment,
  now,
  openId,
  onOpenCase,
  onOpenResolved,
}: Pick<
  SyncSegmentProps,
  'ledger' | 'segment' | 'now' | 'openId' | 'onOpenCase' | 'onOpenResolved'
>): ReactNode {
  if (segment === 'attention') {
    if (ledger.attention.length === 0) return <AllClear ledger={ledger} />;
    return ledger.attention.map((repair) => (
      <CaseRow
        key={repair.id}
        repair={repair}
        devices={ledger.devices}
        now={now}
        active={repair.id === openId}
        onOpen={onOpenCase}
      />
    ));
  }
  if (segment === 'waiting') {
    if (ledger.waiting.length === 0) {
      return <EmptyState icon={Smartphone} title="No device is holding a change" size="md" />;
    }
    return ledger.waiting.map((change) => (
      <WaitingRow
        key={change.id}
        change={change}
        devices={ledger.devices}
        now={now}
        onOpenCase={onOpenCase}
      />
    ));
  }
  if (ledger.resolved.length === 0) {
    return <EmptyState icon={Smartphone} title="No recently resolved cases" size="md" />;
  }
  return ledger.resolved.map((entry) => (
    <ResolvedRow
      key={entry.id}
      entry={entry}
      devices={ledger.devices}
      now={now}
      active={entry.id === openId}
      onOpen={onOpenResolved}
    />
  ));
}

/** Renders the Sync list state and the read-only ledger when it has loaded. */
export function SyncLedgerBody({
  status,
  ledger,
  segment,
  now,
  openId,
  onSegment,
  onOpenCase,
  onOpenResolved,
  onRetry,
  disabledReason,
  onCloseCase,
  onStepCase,
}: SyncLedgerBodyProps): ReactElement {
  if (status === 'error') return <ListError noun="sync" onRetry={onRetry} />;
  if (status === 'pending' || ledger === undefined) return <ListSkeleton label="Loading sync" />;
  return (
    <SyncSegment
      ledger={toSyncLedger(ledger)}
      segment={segment}
      now={now}
      openId={openId}
      onSegment={onSegment}
      onOpenCase={onOpenCase}
      onOpenResolved={onOpenResolved}
      disabledReason={disabledReason}
      onCloseCase={onCloseCase}
      onStepCase={onStepCase}
    />
  );
}

/** Renders the read-only Sync lists and their device status line. */
export function SyncSegment(props: SyncSegmentProps): ReactElement {
  const counts = segmentCounts(props.ledger);
  const repair =
    props.segment === 'attention' && props.openId !== null
      ? props.ledger.attention.find((entry) => entry.id === props.openId)
      : undefined;
  const sheet =
    props.sheet ??
    (repair ? (
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
    ) : null);
  const hasSheet = sheet !== undefined && sheet !== null;
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
    </div>
  );
}
