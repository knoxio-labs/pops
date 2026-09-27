import { ArrowRight, TagIcon } from 'lucide-react';

import { Button, ButtonPrimitive, cn } from '@pops/ui';

import { CodeBadge, ContainerStateBadge } from '../../foundation/badges/badges.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { actionsFor, actionLabel, type BoxAction } from './moving-day-actions.js';
import { movingPlacementName } from './moving-day-model.js';

import type { LucideIcon } from 'lucide-react';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { MovingBox, MovingBoxStage } from './moving-day-model.js';

const STAGE_MARK: Readonly<Record<MovingBoxStage, LucideIcon>> = {
  packing: INVENTORY_ICONS.open,
  full: INVENTORY_ICONS.full,
  closed: INVENTORY_ICONS.closed,
};

/** Props for {@link MovingDayBoxCard}. */
export interface MovingDayBoxCardProps {
  readonly box: MovingBox;
  readonly world: PlacementWorld;
  readonly selected: boolean;
  readonly hideDestination?: boolean;
  readonly pending: boolean;
  readonly disabledReason: string | undefined;
  readonly rejection: string | undefined;
  readonly onAction: (action: BoxAction) => void;
  readonly onOpen: () => void;
}

function actionVariant(stage: MovingBoxStage, index: number): 'ghost' | 'outline' {
  return stage !== 'closed' && index === 0 ? 'outline' : 'ghost';
}

function destinationLabel(box: MovingBox): string {
  return box.destination?.label ?? 'Not decided';
}

function BoxActions({ props }: { readonly props: MovingDayBoxCardProps }) {
  const disabled = props.pending || props.disabledReason !== undefined;
  return (
    <div className="mt-2 flex items-center gap-1.5">
      {actionsFor(props.box.stage).map((action, index) => (
        <Button
          key={action}
          size="sm"
          variant={actionVariant(props.box.stage, index)}
          className="h-8 px-2 whitespace-nowrap"
          disabled={disabled}
          title={props.disabledReason}
          onClick={() => props.onAction(action)}
        >
          {actionLabel(action, props.box.stage)}
        </Button>
      ))}
    </div>
  );
}

function BoxHeading({ props, Mark }: { props: MovingDayBoxCardProps; Mark: LucideIcon }) {
  return (
    <div className="flex items-center gap-2">
      <Mark
        className={cn(
          'size-4 shrink-0',
          props.box.stage === 'closed' ? 'text-muted-foreground' : 'text-app-accent'
        )}
        aria-hidden
      />
      <ButtonPrimitive
        variant="ghost"
        size="xs"
        aria-label={`Open ${props.box.name}`}
        className="h-auto min-w-0 justify-start px-0 text-sm font-medium hover:bg-transparent"
        onClick={props.onOpen}
      >
        <span className="truncate">{props.box.name}</span>
      </ButtonPrimitive>
      <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
        {props.box.count === 0
          ? 'Empty'
          : `${props.box.count} ${props.box.count === 1 ? 'thing' : 'things'}`}
      </span>
    </div>
  );
}

function BoxPlacement({ props }: { readonly props: MovingDayBoxCardProps }) {
  const missingLabel = props.box.stage === 'closed' && props.box.code === null;
  return (
    <div className="mt-1 flex items-center gap-2">
      <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
        <span className="truncate">{movingPlacementName(props.world, props.box)}</span>
        {props.hideDestination ? null : (
          <>
            <ArrowRight className="size-3 shrink-0" aria-hidden />
            <span
              className={cn(
                'truncate',
                props.box.destination === null && 'font-medium text-foreground'
              )}
            >
              {destinationLabel(props.box)}
            </span>
          </>
        )}
      </p>
      <span className="ml-auto shrink-0">
        {missingLabel ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-foreground">
            <TagIcon className="size-3.5 text-warning" aria-hidden />
            No label
          </span>
        ) : (
          <CodeBadge code={props.box.code} />
        )}
      </span>
    </div>
  );
}

function BoxMeta({ box }: { readonly box: MovingBox }) {
  return (
    <div className="mt-1 flex items-center gap-2">
      <ContainerStateBadge
        container={{
          access: box.stage === 'closed' ? 'closed' : 'open',
          full: box.stage === 'full',
        }}
      />
    </div>
  );
}

/** Renders one moving box with placement, destination, label, and stage verbs. */
export function MovingDayBoxCard(props: MovingDayBoxCardProps) {
  const Mark = STAGE_MARK[props.box.stage];
  return (
    <li
      className={cn(
        'group rounded-lg border bg-card px-3 py-2 shadow-xs',
        props.selected ? 'border-app-accent ring-1 ring-app-accent' : 'hover:border-foreground/20'
      )}
    >
      <BoxHeading props={props} Mark={Mark} />
      <BoxPlacement props={props} />
      <BoxMeta box={props.box} />
      {props.rejection ? (
        <p role="alert" className="mt-2 text-xs text-warning">
          {props.rejection}
        </p>
      ) : null}
      <BoxActions props={props} />
    </li>
  );
}
