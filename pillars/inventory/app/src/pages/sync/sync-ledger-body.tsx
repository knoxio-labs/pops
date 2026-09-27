import { ListError, ListSkeleton } from '../../foundation/list-page/list-states.js';
import { toSyncLedger } from './sync-model.js';
import { SyncSegment } from './sync-segment.js';

import type { ReactElement } from 'react';

import type { useSyncLedger } from '../../inventory-web/useSyncLedger.js';
import type { SyncSegment as Segment } from './sync-model.js';

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

/** Renders the Sync ledger's loading, error, and loaded states. */
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
