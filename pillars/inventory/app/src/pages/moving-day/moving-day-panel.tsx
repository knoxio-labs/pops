import { Plus } from 'lucide-react';

import { Button, Sheet } from '@pops/ui';

import { CodeBadge, ContainerStateBadge, QuantityBadge } from '../../foundation/badges/badges.js';
import { actionsFor, actionLabel, type BoxAction } from './moving-day-actions.js';
import { movingPlacementName, containerFactsForBox, looseGroupForBox } from './moving-day-model.js';

import type { PlacementWorld } from '../../foundation/model/placement-model.js';
import type { MovingBox, MovingDayData } from './moving-day-model.js';

const SECTION = 'px-4 pb-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground';

/** Props for the moving-day box side panel. */
export interface MovingDayPanelProps {
  readonly data: MovingDayData;
  readonly world: PlacementWorld;
  readonly box: MovingBox;
  readonly pendingIds: ReadonlySet<string>;
  readonly disabledReason: string | undefined;
  readonly rejections: Readonly<Record<string, string>>;
  readonly onAction: (box: MovingBox, action: BoxAction) => void;
  readonly onPutIn: (ids: readonly string[]) => void;
  readonly onClose: () => void;
}

function boxDescription(world: PlacementWorld, box: MovingBox): string {
  const destination = box.destination?.label ?? 'no destination yet';
  return `Packed in ${movingPlacementName(world, box)}, going to ${destination}.`;
}

function StageVerbs({ props }: { readonly props: MovingDayPanelProps }) {
  const actions = actionsFor(props.box.stage).toReversed();
  return (
    <>
      {actions.map((action, index) => (
        <Button
          key={action}
          variant={index === actions.length - 1 ? 'default' : 'ghost'}
          disabled={props.disabledReason !== undefined || props.pendingIds.has(props.box.id)}
          title={props.disabledReason}
          onClick={() => props.onAction(props.box, action)}
        >
          {actionLabel(action, props.box.stage)}
        </Button>
      ))}
    </>
  );
}

function LooseSection({ props }: { readonly props: MovingDayPanelProps }) {
  const group = looseGroupForBox(props.data, props.world, props.box);
  if (group === null || group.items.length === 0) return null;
  const closed = props.box.stage === 'closed';
  return (
    <>
      <h3 className={`${SECTION} pt-3`}>
        Still loose in {group.room.name}, {group.items.length}
      </h3>
      {closed ? (
        <p className="px-4 pb-1 text-xs text-muted-foreground">Reopen the box to put more in.</p>
      ) : null}
      <ul className="px-2">
        {group.items.map((item) => (
          <li key={item.id} className="flex min-h-9 items-center gap-2 px-2 text-sm">
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            <QuantityBadge quantity={item.quantity} />
            {closed ? null : (
              <Button
                size="sm"
                variant="ghost"
                className="h-8 px-2"
                prefix={<Plus className="size-3.5" aria-hidden />}
                disabled={props.disabledReason !== undefined || props.pendingIds.has(item.id)}
                title={props.disabledReason}
                onClick={() => props.onPutIn([item.id])}
              >
                Put in
              </Button>
            )}
            {props.rejections[item.id] ? (
              <span role="alert" className="text-xs text-warning">
                {props.rejections[item.id]}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </>
  );
}

/** Renders the selected box, its contents, loose room items, and stage actions. */
export function MovingDayPanel(props: MovingDayPanelProps) {
  return (
    <Sheet
      open
      onOpenChange={(open) => {
        if (!open) props.onClose();
      }}
      title={props.box.name}
      description={boxDescription(props.world, props.box)}
      footer={<StageVerbs props={props} />}
    >
      <div className="-mx-3 space-y-1">
        <div className="flex items-center gap-2 px-4 pb-2">
          <ContainerStateBadge container={containerFactsForBox(props.box)} />
          <CodeBadge code={props.box.code} showNone />
        </div>
        <h3 className={SECTION}>In it, {props.box.contents.length}</h3>
        <ul className="px-2">
          {props.box.contents.map((item) => (
            <li key={item.id} className="flex min-h-9 items-center gap-2 px-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{item.name}</span>
              <QuantityBadge quantity={item.quantity} />
            </li>
          ))}
        </ul>
        <LooseSection props={props} />
      </div>
    </Sheet>
  );
}
