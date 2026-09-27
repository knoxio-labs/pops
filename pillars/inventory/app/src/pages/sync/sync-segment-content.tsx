import { Smartphone } from 'lucide-react';

import { EmptyState } from '@pops/ui';

import { formatWhen } from '../../foundation/feedback/when.js';
import { CaseRow, ResolvedRow, WaitingRow } from './ledger-rows.js';

import type { ReactElement, ReactNode } from 'react';

import type { SyncLedger, SyncSegment } from './sync-model.js';

interface RowsProps {
  ledger: SyncLedger;
  segment: SyncSegment;
  now: string;
  openId: string | null;
  onOpenCase: (id: string) => void;
  onOpenResolved: (id: string) => void;
}

export function Devices({ ledger, now }: { ledger: SyncLedger; now: string }): ReactElement {
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

/** Renders the rows for the selected Sync ledger segment. */
export function Rows({
  ledger,
  segment,
  now,
  openId,
  onOpenCase,
  onOpenResolved,
}: RowsProps): ReactNode {
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
