/**
 * The one-line banner for a page or record whose data is not simply fine:
 * stale, offline, conflicting, needing attention, or failed to load. Each
 * says what is true and offers the one action that fixes it (spec 3.8).
 */
import { CircleAlert, CloudOff } from 'lucide-react';

import { Button, cn } from '@pops/ui';

import { INVENTORY_ICONS } from './icons';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

/** What the banner reports. */
export type StateBannerKind = 'stale' | 'offline' | 'conflict' | 'needs-attention' | 'error';

/** Props for {@link StateBanner}. */
export interface StateBannerProps {
  kind: StateBannerKind;
  /** The literal state, one sentence. */
  title: string;
  /** Optional second line: what the next step does. */
  detail?: ReactNode;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

const KIND: Readonly<Record<StateBannerKind, { icon: LucideIcon; tone: string; alert: boolean }>> =
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

/** A state banner with at most one action. */
export function StateBanner({
  kind,
  title,
  detail,
  actionLabel,
  onAction,
  className,
}: StateBannerProps) {
  const { icon: Icon, tone, alert } = KIND[kind];
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
