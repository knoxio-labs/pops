/**
 * One box on moving day: its name and code, where it was packed and where
 * it is going, how many things are in it, and the one next step for its
 * stage. A closed box without a code says so, because it cannot be found
 * by scanning once it is taped.
 */
import { ArrowRight, TagIcon } from 'lucide-react';

import { Button, ButtonPrimitive, cn } from '@pops/ui';

import { CodeBadge, INVENTORY_ICONS, isLocationWithin, targetName } from '../foundation';
import { actionLabel, actionsFor } from './box-actions';

import type { PlacementWorld } from '../foundation';
import type { BoxAction } from './box-actions';
import type { BoxSummary } from './moving-model';

/** Props for {@link BoxCard}. */
export interface BoxCardProps {
  summary: BoxSummary;
  world: PlacementWorld;
  selected?: boolean;
  /** Hide the destination line, when the board is already grouped by it. */
  hideDestination?: boolean;
  onAction?: (action: BoxAction) => void;
  onOpen?: () => void;
}

function things(count: number): string {
  if (count === 0) return 'Empty';
  return count === 1 ? '1 thing' : `${count} things`;
}

function hasArrived(summary: BoxSummary, world: PlacementWorld): boolean {
  const at = summary.box.placement;
  if (summary.destinationId === null || at.kind !== 'location') return false;
  return isLocationWithin(world, at.locationId, summary.destinationId);
}

function Where({ summary, world, hideDestination }: BoxCardProps) {
  const going =
    summary.destinationId === null
      ? 'Not decided'
      : targetName(world, { kind: 'location', locationId: summary.destinationId });
  if (hasArrived(summary, world)) {
    return <p className="truncate text-xs text-muted-foreground">Already at {going}</p>;
  }
  return (
    <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      <span className="truncate">{targetName(world, summary.box.placement)}</span>
      {hideDestination ? null : (
        <>
          <ArrowRight className="size-3 shrink-0" aria-hidden />
          <span
            className={cn(
              'truncate',
              summary.destinationId === null && 'font-medium text-foreground'
            )}
          >
            {going}
          </span>
        </>
      )}
    </p>
  );
}

const STAGE_MARK = {
  packing: INVENTORY_ICONS.open,
  full: INVENTORY_ICONS.full,
  closed: INVENTORY_ICONS.closed,
} as const;

function Title({ summary, onOpen }: Pick<BoxCardProps, 'summary' | 'onOpen'>) {
  const Mark = STAGE_MARK[summary.stage];
  return (
    <div className="flex items-center gap-2">
      <Mark
        className={cn(
          'size-4 shrink-0',
          summary.stage === 'closed' ? 'text-muted-foreground' : 'text-app-accent'
        )}
        aria-hidden
      />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        aria-label={`Open ${summary.box.name}`}
        className="h-auto min-w-0 justify-start px-0 text-sm font-medium hover:bg-transparent"
        onClick={onOpen}
      >
        <span className="truncate">{summary.box.name}</span>
      </ButtonPrimitive>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
        {things(summary.count)}
      </span>
    </div>
  );
}

function Label({ summary }: Pick<BoxCardProps, 'summary'>) {
  if (summary.stage === 'closed' && summary.box.code === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
        <TagIcon className="size-3.5 text-warning" aria-hidden />
        No label
      </span>
    );
  }
  return <CodeBadge code={summary.box.code} />;
}

function Verbs({ summary, onAction }: Pick<BoxCardProps, 'summary' | 'onAction'>) {
  const [primary, secondary] = actionsFor(summary.stage);
  if (onAction === undefined || primary === undefined) return null;
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <Button
        size="sm"
        variant={summary.stage === 'closed' ? 'ghost' : 'outline'}
        className="h-8 px-2 whitespace-nowrap"
        onClick={() => onAction(primary)}
      >
        {actionLabel(primary, summary.stage)}
      </Button>
      {secondary ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 whitespace-nowrap text-muted-foreground"
          onClick={() => onAction(secondary)}
        >
          {actionLabel(secondary, summary.stage)}
        </Button>
      ) : null}
    </div>
  );
}

/** One box card. */
export function BoxCard(props: BoxCardProps) {
  return (
    <li
      className={cn(
        'group rounded-lg border bg-card px-3 py-2 shadow-xs',
        props.selected ? 'border-app-accent ring-1 ring-app-accent' : 'hover:border-foreground/20'
      )}
    >
      <Title summary={props.summary} onOpen={props.onOpen} />
      <div className="mt-1 flex items-center gap-2">
        <Where {...props} />
        <span className="ml-auto shrink-0">
          <Label summary={props.summary} />
        </span>
      </div>
      <Verbs summary={props.summary} onAction={props.onAction} />
    </li>
  );
}
