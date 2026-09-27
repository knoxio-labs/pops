import { useCallback } from 'react';
import { useSearchParams } from 'react-router';

import {
  OFFLINE_REASON,
  OFFLINE_TITLE,
  StateBanner,
} from '../../foundation/feedback/state-banner.js';
import { InventoryPage } from '../../foundation/frame/page-frame.js';
import { Segmented } from '../../foundation/frame/segmented.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { useOnline } from '../../inventory-web/useOnline.js';
import { useSyncLedger } from '../../inventory-web/useSyncLedger.js';
import { ActivitySegment } from './activity/activity-segment.js';
import { SyncLedgerBody } from './sync-ledger-body.js';
import { parseSyncSegment } from './sync-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { SyncSegment as LedgerSegment } from './sync-model.js';

type PageControl = 'activity' | 'sync';
type Navigation =
  | { kind: 'page'; value: PageControl }
  | { kind: 'ledger'; value: LedgerSegment }
  | { kind: 'case'; id: string }
  | { kind: 'resolved'; id: string };

function updateParams(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  update: (params: URLSearchParams) => void
): void {
  setSearchParams(
    (current) => {
      const next = new URLSearchParams(current);
      update(next);
      return next;
    },
    { replace: true }
  );
}

function applyNavigation(next: URLSearchParams, navigation: Navigation): void {
  if (navigation.kind === 'page') {
    if (navigation.value === 'activity') {
      next.set('segment', 'activity');
      next.delete('case');
    } else {
      for (const key of ['segment', 'kind', 'actor', 'q', 'from', 'to', 'item', 'case']) {
        next.delete(key);
      }
    }
    return;
  }
  if (navigation.kind === 'ledger') {
    if (navigation.value === 'attention') next.delete('segment');
    else next.set('segment', navigation.value);
    next.delete('case');
    return;
  }
  next.set('case', navigation.id);
  if (navigation.kind === 'case') next.delete('segment');
}

function StaleBanner({
  reports,
  onReload,
}: {
  reports: ReturnType<typeof useSyncLedger>['reportedSince'];
  onReload: () => void;
}): ReactElement | null {
  if (reports.length === 0) return null;
  const count = reports.reduce((total, report) => total + report.changeCount, 0);
  const names = reports.map((report) => report.device.name).join(' and ');
  return (
    <StateBanner
      kind="stale"
      title={`${names} reported ${count} ${count === 1 ? 'change' : 'changes'} since this loaded.`}
      detail="Reload to see them. The open case stays until you do."
      actionLabel="Reload"
      onAction={onReload}
    />
  );
}

function PageBanner({
  online,
  reports,
  onReload,
}: {
  online: boolean;
  reports: ReturnType<typeof useSyncLedger>['reportedSince'];
  onReload: () => void;
}): ReactNode {
  if (!online) {
    return (
      <StateBanner
        kind="offline"
        title={OFFLINE_TITLE}
        detail="Web actions and Undo are off until the connection is back."
        actionLabel="Retry"
        onAction={onReload}
      />
    );
  }
  return <StaleBanner reports={reports} onReload={onReload} />;
}

function PageActions({
  show,
  attentionCount,
  onChange,
}: {
  show: PageControl;
  attentionCount: number | undefined;
  onChange: (value: PageControl) => void;
}): ReactElement {
  return (
    <Segmented
      label="Show"
      value={show}
      onChange={onChange}
      segments={[
        { id: 'activity', label: 'Activity' },
        { id: 'sync', label: 'Sync', count: attentionCount, alert: true },
      ]}
    />
  );
}

/** Renders the Sync page frame, its URL-selected segment, and the read-only ledger. */
export function SyncPage(): ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const api = useSyncLedger();
  const online = useOnline();
  const segment = parseSyncSegment(searchParams.get('segment'));
  const ledgerSegment: LedgerSegment = segment === 'activity' ? 'attention' : segment;
  const openId = searchParams.get('case');
  const now = new Date().toISOString();
  const disabledReason = online ? undefined : OFFLINE_REASON;
  const navigate = useCallback(
    (navigation: Navigation): void =>
      updateParams(setSearchParams, (next) => applyNavigation(next, navigation)),
    [setSearchParams]
  );
  const onCloseCase = (): void => navigate({ kind: 'ledger', value: 'attention' });
  const onCloseResolved = (): void => navigate({ kind: 'ledger', value: 'resolved' });

  const banner = (
    <PageBanner online={online} reports={api.reportedSince} onReload={() => void api.reload()} />
  );
  const show = segment === 'activity' ? 'activity' : 'sync';

  return (
    <InventoryPage
      title="Sync"
      icon={INVENTORY_ICONS.sync}
      banner={banner}
      bodyClassName="gap-3"
      actions={
        <PageActions
          show={show}
          attentionCount={api.ledger?.attentionCount}
          onChange={(value) => navigate({ kind: 'page', value })}
        />
      }
    >
      {segment === 'activity' ? (
        <ActivitySegment disabledReason={disabledReason} />
      ) : (
        <SyncLedgerBody
          status={api.status}
          ledger={api.ledger}
          segment={ledgerSegment}
          now={now}
          openId={openId}
          disabledReason={disabledReason}
          onSegment={(value) => navigate({ kind: 'ledger', value })}
          onOpenCase={(id) => navigate({ kind: 'case', id })}
          onOpenResolved={(id) => navigate({ kind: 'resolved', id })}
          onCloseCase={segment === 'resolved' ? onCloseResolved : onCloseCase}
          onStepCase={(id) => navigate({ kind: 'case', id })}
          onRetry={() => void api.reload()}
        />
      )}
    </InventoryPage>
  );
}
