import { Button, EmptyState } from '@pops/ui';

import { QuantityBadge } from '../../foundation/badges/badges.js';
import { INVENTORY_ICONS } from '../../foundation/model/icons.js';
import { BoardColumn } from './moving-day-stage-board.js';

import type { MovingDayData } from './moving-day-model.js';

type PackableThing =
  | MovingDayData['loose'][number]['items'][number]
  | MovingDayData['inHand'][number];

function LooseRow({
  item,
  disabledReason,
  rejection,
  onPack,
}: {
  readonly item: PackableThing;
  readonly disabledReason: string | undefined;
  readonly rejection: string | undefined;
  readonly onPack: () => void;
}) {
  return (
    <li className="rounded-md bg-card px-2.5 py-1.5 text-sm">
      <div className="flex min-h-8 items-center gap-2">
        <span className="min-w-0 flex-1 truncate">{item.name}</span>
        <QuantityBadge quantity={item.quantity} />
        <Button
          size="sm"
          variant="ghost"
          className="h-8 px-2 text-muted-foreground"
          disabled={disabledReason !== undefined}
          title={disabledReason}
          onClick={onPack}
          prefix={<INVENTORY_ICONS.container className="size-3.5" aria-hidden />}
        >
          Pack
        </Button>
      </div>
      {rejection ? (
        <p role="alert" className="text-xs text-warning">
          {rejection}
        </p>
      ) : null}
    </li>
  );
}

function LooseGroup({
  id,
  title,
  items,
  disabledReason,
  rejections,
  onPack,
}: {
  readonly id: string;
  readonly title: string;
  readonly items: readonly PackableThing[];
  readonly disabledReason: string | undefined;
  readonly rejections: Readonly<Record<string, string>>;
  readonly onPack: (ids: readonly string[]) => void;
}) {
  return (
    <BoardColumn key={id} title={title} count={items.length}>
      {items.map((item) => (
        <LooseRow
          key={item.id}
          item={item}
          disabledReason={disabledReason}
          rejection={rejections[item.id]}
          onPack={() => onPack([item.id])}
        />
      ))}
      {items.length > 1 ? (
        <li>
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            disabled={disabledReason !== undefined}
            title={disabledReason}
            onClick={() => onPack(items.map((item) => item.id))}
          >
            Pack all {items.length}
          </Button>
        </li>
      ) : null}
    </BoardColumn>
  );
}

/** Renders loose room and in-hand groups with individual and bulk Pack actions. */
export function LooseBoard({
  data,
  disabledReason,
  rejections,
  onPack,
}: {
  readonly data: MovingDayData;
  readonly disabledReason: string | undefined;
  readonly rejections: Readonly<Record<string, string>>;
  readonly onPack: (ids: readonly string[]) => void;
}) {
  const groups: readonly {
    readonly id: string;
    readonly title: string;
    readonly items: readonly PackableThing[];
  }[] = [
    ...data.loose.map((group) => ({
      id: group.room.id,
      title: group.room.name,
      items: group.items,
    })),
    ...(data.inHand.length > 0 ? [{ id: 'in-hand', title: 'In hand', items: data.inHand }] : []),
  ];
  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed bg-card">
        <EmptyState
          title="Nothing is waiting to be packed"
          description="All loose things are accounted for."
        />
      </div>
    );
  }
  return (
    <div className="grid min-h-0 flex-1 auto-rows-min grid-cols-1 items-start gap-3 overflow-y-auto lg:grid-cols-3">
      {groups.map((group) => (
        <LooseGroup
          key={group.id}
          id={group.id}
          title={group.title}
          items={group.items}
          disabledReason={disabledReason}
          rejections={rejections}
          onPack={onPack}
        />
      ))}
    </div>
  );
}
