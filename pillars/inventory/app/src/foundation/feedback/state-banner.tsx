import { CircleAlert, CloudOff } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';

import type { LucideIcon } from 'lucide-react';
import type { ReactElement, ReactNode } from 'react';

/** The offline banner's title. */
export const OFFLINE_TITLE = 'No connection. Showing what loaded.';

/** The reason shown when changes are disabled offline. */
export const OFFLINE_REASON = 'No connection. Changes are off until it is back.';

/** The states represented by the inventory banner. */
export type StateBannerKind = 'stale' | 'offline' | 'conflict' | 'needs-attention' | 'error';

/** Props for {@link StateBanner}. */
export interface StateBannerProps {
  kind: StateBannerKind;
  /** The literal state in one sentence. */
  title: string;
  /** Optional second line describing the next step. */
  detail?: ReactNode;
  /** The single action that can resolve the state. */
  actionLabel?: string;
  /** Invoked by the optional action. */
  onAction?: () => void;
  /** Additional token-backed classes for the banner wrapper. */
  className?: string;
}

const KINDS: Readonly<Record<StateBannerKind, { icon: LucideIcon; tone: string; alert: boolean }>> =
  {
    stale: { icon: INVENTORY_ICONS.stale, tone: 'border-warning/40 bg-warning/10', alert: false },
    offline: { icon: CloudOff, tone: 'border-border bg-muted', alert: false },
    conflict: {
      icon: INVENTORY_ICONS.needsAttention,
      tone: 'border-warning bg-warning/15',
      alert: true,
    },
    'needs-attention': {
      icon: INVENTORY_ICONS.needsAttention,
      tone: 'border-warning/40 bg-warning/10',
      alert: false,
    },
    error: { icon: CircleAlert, tone: 'border-border bg-card', alert: true },
  };

/** Renders one inventory state with at most one action. */
export function StateBanner({
  kind,
  title,
  detail,
  actionLabel,
  onAction,
  className,
}: StateBannerProps): ReactElement {
  const { icon: Icon, tone, alert } = KINDS[kind];
  return (
    <div
      role={alert ? 'alert' : 'status'}
      className={cn('flex items-center gap-3 rounded-lg border px-3 py-2', tone, className)}
    >
      <Icon
        className={cn(
          'size-4 shrink-0',
          kind === 'offline' || kind === 'error' ? 'text-muted-foreground' : 'text-warning'
        )}
        aria-hidden
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{title}</p>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </div>
      {actionLabel ? (
        <Button size="sm" variant="outline" onClick={onAction} className="shrink-0 bg-background">
          {actionLabel}
        </Button>
      ) : null}
    </div>
  );
}
