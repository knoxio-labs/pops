/**
 * Drag affordances shared by inventory targets: the In hand dock, a target
 * verdict, and the compact ghost that follows a dragged row.
 */
import { Ban } from 'lucide-react';

import { cn } from '@pops/ui';

import { INVENTORY_ICONS } from '../model/icons';

import type { DropTargetState } from './use-drag-placement';

/** Classes a drop target (tree node, container row, preview pane) adds for its state. */
export const DROP_TARGET_CLASS: Readonly<Record<DropTargetState, string>> = {
  idle: '',
  available: 'outline-dashed outline-1 outline-app-accent/50',
  over: 'bg-app-accent/15 outline-2 outline-app-accent',
  refused: 'cursor-no-drop opacity-60',
};

function things(count: number): string {
  return count === 1 ? '1 item' : `${count} items`;
}

/** Props for {@link DragDock}. */
export interface DragDockProps {
  count: number;
  state: Exclude<DropTargetState, 'idle'>;
  /** Why the strip refuses, e.g. everything dragged is already in hand. */
  reason?: string;
  className?: string;
}

/** The In hand drop strip. */
export function DragDock({ count, state, reason, className }: DragDockProps) {
  const Icon = state === 'refused' ? Ban : INVENTORY_ICONS.inHand;
  const text =
    state === 'refused' ? (reason ?? 'Cannot hold these') : `Drop to hold ${things(count)} in hand`;
  return (
    <div
      role="region"
      aria-label="In hand drop area"
      className={cn(
        'flex h-14 items-center justify-center gap-2 rounded-xl border-2 border-dashed text-sm transition-colors',
        state === 'over'
          ? 'border-app-accent bg-app-accent/15 text-foreground'
          : 'border-border bg-muted/60 text-muted-foreground',
        state === 'refused' && 'cursor-no-drop',
        className
      )}
    >
      <Icon
        className={cn('size-4', state === 'over' ? 'text-app-accent' : 'text-muted-foreground')}
        aria-hidden
      />
      {text}
    </div>
  );
}

/** The one-line verdict a hovered target shows under the pointer. */
export function DropHint({
  verdict,
}: {
  verdict: { ok: true; count: number; targetName: string } | { ok: false; reason: string };
}) {
  return (
    <span
      role="status"
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md border bg-popover px-2 py-1 text-xs shadow-md',
        verdict.ok ? 'text-foreground' : 'text-muted-foreground'
      )}
    >
      {verdict.ok ? (
        <INVENTORY_ICONS.move className="size-3.5 text-app-accent" aria-hidden />
      ) : (
        <Ban className="size-3.5" aria-hidden />
      )}
      {verdict.ok ? `Move ${things(verdict.count)} to ${verdict.targetName}` : verdict.reason}
    </span>
  );
}

/** The drag ghost: the grabbed row's name and, for a multi-drag, the count. */
export function DragGhost({ name, count }: { name: string; count: number }) {
  return (
    <span className="relative inline-flex max-w-64 items-center gap-2 rounded-lg border bg-card px-3 py-2 text-sm font-medium shadow-xl">
      <INVENTORY_ICONS.item className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="truncate">{name}</span>
      {count > 1 ? (
        <span className="absolute -top-2 -right-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-2xs font-semibold text-primary-foreground">
          {count}
        </span>
      ) : null}
    </span>
  );
}
