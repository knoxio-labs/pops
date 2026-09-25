/**
 * One box being packed, in a side sheet over the board: its stage and next step, what is
 * in it, and what is still loose in the room it is being packed in, each
 * one click from going in. A closed box says what it holds and refuses new
 * things until it is reopened.
 */
import { Plus } from 'lucide-react';

import { Button } from '@pops/ui';

import {
  CodeBadge,
  ContainerStateBadge,
  QuantityBadge,
  Sheet,
  deepContents,
  targetName,
} from '../foundation';
import { actionLabel, actionsFor } from './box-actions';
import { roomOf } from './moving-model';

import type { ReactNode } from 'react';

import type { ItemRowModel, PlacementWorld } from '../foundation';
import type { BoxAction } from './box-actions';
import type { BoxSummary, MovingSummary } from './moving-model';

/** Props for {@link BoxPanel}. */
export interface BoxPanelProps {
  world: PlacementWorld;
  homeId: string;
  box: BoxSummary;
  summary: MovingSummary;
  onAction: (action: BoxAction) => void;
  onPutIn: (ids: readonly string[]) => void;
  onClose: () => void;
}

function Row({ entry, action }: { entry: ItemRowModel; action?: ReactNode }) {
  return (
    <li className="flex h-9 items-center gap-2 px-2 text-sm">
      <span className="min-w-0 flex-1 truncate">{entry.name}</span>
      <QuantityBadge quantity={entry.quantity} />
      {action}
    </li>
  );
}

function looseInRoom(props: BoxPanelProps): ItemRowModel[] {
  const at = props.box.box.placement;
  if (at.kind !== 'location') return [];
  const room = roomOf(props.world, props.homeId, at.locationId);
  return props.summary.loose.find((group) => group.room.id === room?.id)?.items ?? [];
}

const SECTION = 'px-4 pb-1 text-2xs font-semibold uppercase tracking-label text-muted-foreground';

function StageVerbs({ box, onAction }: Pick<BoxPanelProps, 'box' | 'onAction'>) {
  return (
    <>
      {actionsFor(box.stage)
        .toReversed()
        .map((action, index, all) => (
          <Button
            key={action}
            variant={index === all.length - 1 ? 'default' : 'ghost'}
            onClick={() => onAction(action)}
          >
            {actionLabel(action, box.stage)}
          </Button>
        ))}
    </>
  );
}

function describe(world: PlacementWorld, box: BoxSummary): string {
  const packedIn = targetName(world, box.box.placement);
  const going =
    box.destinationId === null
      ? 'no destination yet'
      : `going to ${targetName(world, { kind: 'location', locationId: box.destinationId })}`;
  return `Packed in ${packedIn}, ${going}.`;
}

function LooseSection({ props, room }: { props: BoxPanelProps; room: string }) {
  const loose = looseInRoom(props);
  if (loose.length === 0) return null;
  const closed = props.box.stage === 'closed';
  return (
    <>
      <h3 className={`${SECTION} pt-3`}>
        Still loose in {room}, {loose.length}
      </h3>
      {closed ? (
        <p className="px-4 pb-1 text-xs text-muted-foreground">Reopen the box to put more in.</p>
      ) : null}
      <ul className="px-2">
        {loose.map((entry) => (
          <Row
            key={entry.id}
            entry={entry}
            action={
              closed ? undefined : (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-8 px-2"
                  onClick={() => props.onPutIn([entry.id])}
                  prefix={<Plus className="size-3.5" aria-hidden />}
                >
                  Put in
                </Button>
              )
            }
          />
        ))}
      </ul>
    </>
  );
}

/** The panel, as a side sheet over the board. */
export function BoxPanel(props: BoxPanelProps) {
  const { box, world } = props;
  const inside = deepContents(world, box.box.id).filter((entry) => entry.lifecycle === 'active');
  const room = box.box.placement.kind === 'location' ? targetName(world, box.box.placement) : null;
  return (
    <Sheet
      open
      onOpenChange={(open) => (open ? undefined : props.onClose())}
      title={box.box.name}
      description={describe(world, box)}
      footer={<StageVerbs box={box} onAction={props.onAction} />}
    >
      <div className="-mx-3 space-y-1">
        <div className="flex items-center gap-2 px-4 pb-2">
          <ContainerStateBadge container={box.box.container} />
          <CodeBadge code={box.box.code} showNone />
        </div>
        <h3 className={SECTION}>In it, {inside.length}</h3>
        <ul className="px-2">
          {inside.map((entry) => (
            <Row key={entry.id} entry={entry} />
          ))}
        </ul>
        {room === null ? null : <LooseSection props={props} room={room} />}
      </div>
    </Sheet>
  );
}
