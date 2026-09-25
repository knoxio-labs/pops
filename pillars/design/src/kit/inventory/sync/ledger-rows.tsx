/**
 * The three Sync lists' rows: a case that needs a person, a change a device
 * is holding and why, and a case that closed and how.
 */
import { ChevronRight, CircleCheck, Hourglass } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { formatWhen } from '../activity/when';
import { INVENTORY_ICONS } from '../shared/icons';
import { deviceName } from './sync-model';

import type { ReactNode } from 'react';

import type {
  DeviceModel,
  RepairCase,
  ResolvedEntry,
  WaitReason,
  WaitingChange,
} from './sync-model';

function Row({
  icon,
  title,
  detail,
  meta,
  action,
  active = false,
}: {
  icon: ReactNode;
  title: ReactNode;
  detail: ReactNode;
  meta: ReactNode;
  action?: ReactNode;
  active?: boolean;
}) {
  return (
    <li
      aria-current={active || undefined}
      className={cn(
        'flex h-14 items-center gap-3 border-l-2 pr-2 pl-3',
        active ? 'border-l-app-accent bg-app-accent/10' : 'border-l-transparent hover:bg-muted/50'
      )}
    >
      {icon}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      <span
        data-meta
        className="hidden shrink-0 text-xs text-muted-foreground tabular-nums lg:inline"
      >
        {meta}
      </span>
      {action}
    </li>
  );
}

/** A case that needs a person. */
export function CaseRow({
  repair,
  devices,
  now,
  active,
  onOpen,
}: {
  repair: RepairCase;
  devices: readonly DeviceModel[];
  now: string;
  active?: boolean;
  onOpen?: (id: string) => void;
}) {
  return (
    <Row
      active={active}
      icon={<INVENTORY_ICONS.needsAttention className="size-4 shrink-0 text-warning" aria-hidden />}
      title={repair.itemName}
      detail={repair.problem}
      meta={`${deviceName(devices, repair.deviceId)} · ${formatWhen(repair.openedAt, now)}`}
      action={
        <Button
          size="sm"
          variant={active ? 'default' : 'outline'}
          aria-label={`Review ${repair.itemName}: ${repair.problem}`}
          onClick={() => onOpen?.(repair.id)}
          suffix={<ChevronRight className="size-3.5" aria-hidden />}
        >
          Review
        </Button>
      }
    />
  );
}

function waitText(reason: WaitReason, device: string): string {
  switch (reason.kind) {
    case 'depends':
      return `Sends after ${reason.on}`;
    case 'catalogue':
      return `Sends once ${device} downloads catalogue revision ${reason.revision}`;
    case 'app-update':
      return `Sends once ${device} is updated from the App Store`;
    case 'behind-case':
      return `Sends after the ${reason.itemName} case is decided`;
  }
}

/** A change a device is holding. */
export function WaitingRow({
  change,
  devices,
  now,
  onOpenCase,
}: {
  change: WaitingChange;
  devices: readonly DeviceModel[];
  now: string;
  onOpenCase?: (id: string) => void;
}) {
  const device = deviceName(devices, change.deviceId);
  const { reason } = change;
  return (
    <Row
      icon={<Hourglass className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      title={
        <>
          {change.itemName}{' '}
          <span className="font-normal text-muted-foreground">{change.summary}</span>
        </>
      }
      detail={waitText(reason, device)}
      meta={`${device} · ${formatWhen(change.since, now)}`}
      action={
        reason.kind === 'behind-case' ? (
          <Button size="sm" variant="ghost" onClick={() => onOpenCase?.(reason.caseId)}>
            Open case
          </Button>
        ) : undefined
      }
    />
  );
}

/** A case that closed. */
export function ResolvedRow({
  entry,
  devices,
  now,
  onOpen,
}: {
  entry: ResolvedEntry;
  devices: readonly DeviceModel[];
  now: string;
  onOpen?: (id: string) => void;
}) {
  const dropped = entry.dropped?.length ?? 0;
  return (
    <Row
      icon={<CircleCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      title={entry.itemName}
      detail={dropped > 0 ? `${entry.outcome}. ${dropped} values were not saved` : entry.outcome}
      meta={`${deviceName(devices, entry.deviceId)} · ${formatWhen(entry.at, now)}`}
      action={
        dropped > 0 ? (
          <Button size="sm" variant="outline" onClick={() => onOpen?.(entry.id)}>
            See what was dropped
          </Button>
        ) : undefined
      }
    />
  );
}
