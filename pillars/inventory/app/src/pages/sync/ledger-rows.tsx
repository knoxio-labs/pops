import { ChevronRight, CircleCheck, Hourglass } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { formatWhen } from '../../foundation/feedback/when.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { deviceName, waitText } from './sync-model.js';

import type { ReactElement, ReactNode } from 'react';

import type { DeviceModel, RepairCase, ResolvedEntry, WaitingChange } from './sync-model.js';

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
}): ReactElement {
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

/** Renders one case that needs a person to make a decision. */
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
  onOpen: (id: string) => void;
}): ReactElement {
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
          onClick={() => onOpen(repair.id)}
          suffix={<ChevronRight className="size-3.5" aria-hidden />}
        >
          Review
        </Button>
      }
    />
  );
}

/** Renders one change held by a device and, when available, its open case link. */
export function WaitingRow({
  change,
  devices,
  now,
  onOpenCase,
}: {
  change: WaitingChange;
  devices: readonly DeviceModel[];
  now: string;
  onOpenCase: (id: string) => void;
}): ReactElement {
  const device = deviceName(devices, change.deviceId);
  const { reason } = change;
  const caseId = reason.kind === 'behind-case' ? reason.caseId : undefined;
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
        caseId === undefined ? null : (
          <Button size="sm" variant="ghost" onClick={() => onOpenCase(caseId)}>
            Open case
          </Button>
        )
      }
    />
  );
}

/** Renders one recently resolved case and its dropped-value link when present. */
export function ResolvedRow({
  entry,
  devices,
  now,
  active,
  onOpen,
}: {
  entry: ResolvedEntry;
  devices: readonly DeviceModel[];
  now: string;
  active?: boolean;
  onOpen: (id: string) => void;
}): ReactElement {
  const dropped = entry.dropped?.length ?? 0;
  return (
    <Row
      active={active}
      icon={<CircleCheck className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
      title={entry.itemName}
      detail={dropped > 0 ? `${entry.outcome}. ${dropped} values were not saved` : entry.outcome}
      meta={`${deviceName(devices, entry.deviceId)} · ${formatWhen(entry.at, now)}`}
      action={
        dropped > 0 ? (
          <Button size="sm" variant="outline" onClick={() => onOpen(entry.id)}>
            See what was dropped
          </Button>
        ) : undefined
      }
    />
  );
}
