import { MoreHorizontal, X } from 'lucide-react';

import {
  Button,
  ButtonPrimitive,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRoot,
  DropdownMenuTrigger,
  cn,
} from '@pops/ui';

import { HintTooltip } from '../shortcuts/hint-tooltip';
import { ShortcutHint } from '../shortcuts/shortcut-hint';

import type { ReactElement } from 'react';

import type { SelectionBarAction } from '../model';
import type { SelectionCoverage } from './use-selection';

/** Props for the shared inventory selection action bar. */
export interface SelectionBarProps {
  count: number;
  /** Number of rows currently loaded, used by the Select all affordance. */
  loadedCount: number;
  coverage: SelectionCoverage;
  actions: readonly SelectionBarAction[];
  /** Number of additional rows carried by selected containers. */
  carriedCount?: number;
  onSelectAll?: () => void;
  onClear?: () => void;
  className?: string;
}

function summary(count: number, carried: number): string {
  const selected = `${count} selected`;
  return carried > 0 ? `${selected}, ${carried} inside` : selected;
}

function BarAction({ action }: { action: SelectionBarAction }): ReactElement {
  const Icon = action.icon;
  const disabled = action.disabledReason !== undefined;
  return (
    <HintTooltip
      label={action.label}
      shortcutId={action.shortcutId}
      disabledReason={action.disabledReason}
    >
      <Button
        size="sm"
        variant="ghost"
        aria-disabled={disabled || undefined}
        className={cn('shrink-0 gap-1 px-1.5 whitespace-nowrap', disabled && 'opacity-50')}
        onClick={disabled ? undefined : action.onSelect}
        prefix={<Icon className="size-4 text-muted-foreground" aria-hidden />}
        suffix={
          action.shortcutId ? (
            <ShortcutHint id={action.shortcutId} className="max-lg:hidden" />
          ) : undefined
        }
      >
        <span className="max-lg:sr-only">{action.label}</span>
      </Button>
    </HintTooltip>
  );
}

function MoreMenu({ actions }: { actions: readonly SelectionBarAction[] }): ReactElement | null {
  if (actions.length === 0) return null;
  return (
    <DropdownMenuRoot>
      <DropdownMenuTrigger asChild>
        <ButtonPrimitive variant="ghost" size="icon-sm" aria-label="More actions for the selection">
          <MoreHorizontal className="size-4" aria-hidden />
        </ButtonPrimitive>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <DropdownMenuItem
              key={action.id}
              disabled={action.disabledReason !== undefined}
              onSelect={action.onSelect}
            >
              <Icon className="size-4" aria-hidden />
              {action.label}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenuRoot>
  );
}

/** Renders the bulk-action bar, or nothing while the list is unselected. */
export function SelectionBar({
  count,
  loadedCount,
  coverage,
  actions,
  carriedCount = 0,
  onSelectAll,
  onClear,
  className,
}: SelectionBarProps): ReactElement | null {
  if (count === 0) return null;
  const inline = actions.filter((action) => action.overflow !== true);
  const overflow = actions.filter((action) => action.overflow === true);
  return (
    <div
      role="region"
      aria-label="Selection"
      className={cn(
        'flex items-center gap-1 rounded-xl border bg-card py-1.5 pr-1.5 pl-3 shadow-lg',
        className
      )}
    >
      <p
        aria-live="polite"
        aria-atomic="true"
        className="shrink-0 text-sm font-medium tabular-nums"
      >
        {summary(count, carriedCount)}
      </p>
      {coverage === 'some' && loadedCount > count && onSelectAll !== undefined ? (
        <Button
          size="sm"
          variant="ghost"
          className="shrink-0 px-2 text-xs whitespace-nowrap text-muted-foreground"
          onClick={onSelectAll}
        >
          Select all {loadedCount}
        </Button>
      ) : null}
      <span className="mx-0.5 h-5 w-px shrink-0 bg-border" aria-hidden />
      <div className="flex min-w-0 flex-1 items-center gap-0.5">
        {inline.map((action) => (
          <BarAction key={action.id} action={action} />
        ))}
        <MoreMenu actions={overflow} />
      </div>
      <HintTooltip label="Clear selection" shortcutId="dismiss">
        <ButtonPrimitive
          variant="ghost"
          size="icon-sm"
          aria-label="Clear selection"
          onClick={onClear}
        >
          <X className="size-4" aria-hidden />
        </ButtonPrimitive>
      </HintTooltip>
    </div>
  );
}
